import axios from 'axios';

const API_BASE_URL =
  import.meta.env.VITE_BOQ_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  '';

const DASH = '[:\\-\\u2013\\u2014]';

const EMPTY = {
  project_name: '',
  client_name: '',
  project_type: '',
  location: '',
  estimated_value: '',
  currency: 'INR',
  deadline: '',
  description: '',
  contact_person: '',
  contact_email: '',
  tender_number: '',
  floors: '',
  area_sqm: '',
};

let backendWarned = false;
let pdfJsModulePromise = null;

function sanitize(value) {
  return value == null ? '' : String(value).trim();
}

function normalizePayload(payload = {}) {
  return {
    ...EMPTY,
    ...payload,
    project_name: sanitize(payload.project_name),
    client_name: sanitize(payload.client_name),
    project_type: sanitize(payload.project_type),
    location: sanitize(payload.location),
    estimated_value: sanitize(payload.estimated_value).replace(/,/g, ''),
    currency: sanitize(payload.currency) || 'INR',
    deadline: sanitize(payload.deadline),
    description: sanitize(payload.description),
    contact_person: sanitize(payload.contact_person),
    contact_email: sanitize(payload.contact_email),
    tender_number: sanitize(payload.tender_number),
    floors: sanitize(payload.floors),
    area_sqm: sanitize(payload.area_sqm).replace(/,/g, ''),
  };
}

function hasAnyStructuredField(data = {}) {
  const keys = [
    'project_name',
    'client_name',
    'project_type',
    'location',
    'estimated_value',
    'deadline',
    'description',
    'contact_email',
    'tender_number',
  ];
  return keys.some((key) => sanitize(data[key]));
}

export async function extractGeneralInfo(file) {
  if (!file) return { ...EMPTY };

  const backendResult = await extractFromBackend(file);
  if (backendResult && hasAnyStructuredField(backendResult)) {
    return backendResult;
  }

  const clientResult = await clientSideExtract(file);
  return normalizePayload(clientResult);
}

async function extractFromBackend(file) {
  if (!API_BASE_URL) {
    return null;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await axios.post(`${API_BASE_URL}/extract-general-info`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 45000,
    });
    const payload = response.data?.data ?? response.data ?? {};
    return normalizePayload(payload);
  } catch (error) {
    if (!backendWarned) {
      backendWarned = true;
      console.info('[GI Extractor] Backend extraction unavailable, using local parser.');
    }
    return null;
  }
}

async function clientSideExtract(file) {
  try {
    const text = await readPdfText(file);
    if (!text || text.length < 20) return { ...EMPTY };

    return normalizePayload({
      project_name: matchField(
        text,
        new RegExp(`(?:project\\s*(?:name|title)|name\\s*of\\s*work)\\s*${DASH}\\s*(.{3,120}?)(?:\\s{2,}|\\n|$)`, 'i')
      ),
      client_name: matchField(
        text,
        new RegExp(`(?:client|owner|employer|authority)\\s*(?:name)?\\s*${DASH}\\s*(.{3,120}?)(?:\\s{2,}|\\n|$)`, 'i')
      ),
      project_type: inferProjectType(text),
      location: extractLocation(text),
      estimated_value: extractEstimatedValue(text),
      currency: inferCurrency(text),
      deadline: matchDate(text),
      description: summarizeText(text),
      contact_person: matchField(
        text,
        new RegExp(
          `(?:contact\\s*person|engineer\\s*in\\s*charge|project\\s*manager)\\s*${DASH}\\s*(.{3,80}?)(?:\\s{2,}|\\n|$)`,
          'i'
        )
      ),
      contact_email: matchField(text, /[\w.-]+@[\w.-]+\.\w{2,}/),
      tender_number: extractTenderNumber(text),
      floors: matchField(text, /(\d+)\s*(?:floor|floors|storey|storeys|story|stories)\b/i),
      area_sqm:
        matchField(text, /([\d,]+)\s*(?:sq\.?\s*m|sqm|m2|m\u00B2)\b/i)?.replace(/,/g, '') || '',
    });
  } catch (error) {
    console.warn('[GI Extractor] Local PDF parsing failed:', error?.message || error);
    return { ...EMPTY };
  }
}

function matchField(text, regex) {
  const match = text.match(regex);
  if (!match) return '';
  return sanitize(match[1] || match[0]);
}

/** Extract location — limited to short, meaningful text */
function extractLocation(text) {
  // Try structured "Location : value" first
  const structured = text.match(
    new RegExp(`(?:location|site\\s*(?:location|address)|place\\s*of\\s*work|address)\\s*${DASH}\\s*(.{3,150}?)(?:\\s{2,}|\\n|\\d+\\s|$)`, 'i')
  );
  if (structured) {
    // Clean: remove URLs, long legal text, "Sd/", signatures
    let loc = sanitize(structured[1])
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\b(?:Sd\/|Authorised\s+Signatory|reserves?\s+the\s+right).*$/i, '')
      .replace(/\bthe\s+bidder\b.*$/i, '')
      .trim();
    if (loc.length > 3 && loc.length < 150) return loc;
  }

  // Fallback: look for Indian city/state names
  const cities = text.match(
    /\b(Mumbai|Delhi|Bangalore|Bengaluru|Chennai|Hyderabad|Kolkata|Pune|Ahmedabad|Jaipur|Lucknow|Guwahati|Bhopal|Chandigarh|Patna|Thiruvananthapuram|Kochi|Nagpur|Indore|Coimbatore|Visakhapatnam|Surat|Vadodara|Ranchi|Dehradun|Shimla|Jammu|Srinagar|Imphal|Shillong|Aizawl|Kohima|Gangtok|Agartala|Itanagar|Dibrugarh|Jorhat|Tinsukia|Silchar|Assam|Maharashtra|Karnataka|Tamil\s*Nadu|Telangana|West\s*Bengal|Gujarat|Rajasthan|Uttar\s*Pradesh|Madhya\s*Pradesh|Kerala|Bihar|Odisha|Punjab|Haryana|Jharkhand|Chhattisgarh|Uttarakhand|Goa|Tripura|Meghalaya|Manipur|Nagaland|Mizoram|Arunachal\s*Pradesh|Sikkim)[,\s]*/i
  );
  if (cities) return sanitize(cities[1]);

  return '';
}

/** Extract tender/reference number — just the code, not specs */
function extractTenderNumber(text) {
  // Pattern: "Tender Ref No." or "NIT No." followed by a short reference code
  const patterns = [
    /tender\s*ref(?:erence)?\s*(?:no\.?|number|#)\s*[:\-–—]?\s*([A-Z0-9][\w\-\/().]{2,40})/i,
    /(?:tender|nit)\s*(?:no\.?|number|#)\s*[:\-–—]?\s*([A-Z0-9][\w\-\/().]{2,40})/i,
    /ref(?:erence)?\s*(?:no\.?|number|#)\s*[:\-–—]?\s*([A-Z0-9][\w\-\/().]{2,40})/i,
    /(?:tender|nit|reference)\s*[:\-–—]\s*([A-Z0-9][\w\-\/().]{2,40})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const val = sanitize(match[1]);
      // Reject if it looks like technical specs (contains "should", "must", "mm", "vacuum", etc.)
      if (/(?:should|must|shall|vacuum|suction|mm\s*of|hg|unit)/i.test(val)) continue;
      if (val.length >= 3) return val;
    }
  }
  return '';
}

/** Extract estimated value — look for currency amounts in the right context */
function extractEstimatedValue(text) {
  // Try structured label first
  const structured = text.match(
    new RegExp(
      `(?:estimated\\s*(?:cost|value|budget)|project\\s*(?:cost|value|budget)|tender\\s*(?:value|cost|amount)|contract\\s*(?:value|amount))\\s*${DASH}\\s*[\\u20B9$₹]?\\s*([\\d,.]+\\s*(?:lakh|lakhs|crore|crores|cr|lac|million|billion)?)`,
      'i'
    )
  );
  if (structured) return sanitize(structured[1]).replace(/,/g, '');

  // Look for large INR amounts (lakhs/crores)
  const inrAmount = text.match(
    /[\u20B9₹]\s*([\d,.]+)\s*(?:lakh|lakhs|crore|crores|cr|lac|million)?/i
  );
  if (inrAmount) return sanitize(inrAmount[1]).replace(/,/g, '');

  // Look for "Rs." or "INR" amounts
  const rsAmount = text.match(
    /(?:Rs\.?|INR)\s*([\d,.]+)\s*(?:lakh|lakhs|crore|crores|cr|lac|million)?/i
  );
  if (rsAmount) return sanitize(rsAmount[1]).replace(/,/g, '');

  return '';
}

function isValidDate(year, month, day) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1990 || y > 2099) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function matchDate(text) {
  // ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatches = [...text.matchAll(/\b(\d{4})[-/](\d{2})[-/](\d{2})\b/g)];
  for (const m of isoMatches) {
    if (isValidDate(m[1], m[2], m[3])) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatches = [...text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)];
  for (const m of dmyMatches) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    if (isValidDate(m[3], month, day)) {
      return `${m[3]}-${month}-${day}`;
    }
  }

  // Month name format: "April 2021", "17 April 2021", etc.
  const monthName = text.match(
    /\b(\d{1,2})?\s*(?:st|nd|rd|th)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)[,\s]+(\d{4})\b/i
  );
  if (monthName) {
    const months = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
    const mo = months[monthName[2].toLowerCase()];
    const dy = (monthName[1] || '01').padStart(2, '0');
    const yr = monthName[3];
    if (isValidDate(yr, mo, dy)) return `${yr}-${mo}-${dy}`;
  }

  return '';
}

function inferCurrency(text) {
  if (/[\u20B9₹]|(?:^|\s)INR(?:\s|$)/i.test(text)) return 'INR';
  if (/(?:^|\s)Rs\.?\s*\d/i.test(text)) return 'INR';
  if (/\$\s*\d|(?:^|\s)USD(?:\s|$)/i.test(text)) return 'USD';
  if (/(?:^|\s)AED(?:\s|$)/i.test(text)) return 'AED';
  // SAR must appear as a standalone currency marker, not inside words
  if (/(?:^|\s)SAR\s*\d|(?:^|\s)SAR(?:\s|$)/i.test(text)) return 'SAR';
  return 'INR';
}

function inferProjectType(text) {
  const lower = text.toLowerCase();
  const typeMap = [
    ['hospital', 'Hospital'],
    ['office', 'Office'],
    ['residential', 'Residential'],
    ['industrial', 'Industrial'],
    ['government', 'Government'],
    ['school', 'Educational'],
    ['university', 'Educational'],
    ['college', 'Educational'],
    ['infrastructure', 'Infrastructure'],
    ['mixed use', 'Mixed Use'],
    ['mixed-use', 'Mixed Use'],
  ];

  for (const [keyword, type] of typeMap) {
    if (lower.includes(keyword)) return type;
  }
  return '';
}

function summarizeText(text) {
  // Use only the first ~2000 chars (first page area) to avoid technical specs
  const firstPage = text.slice(0, 2000);
  const normalized = firstPage
    .replace(/\s+/g, ' ')
    .replace(/Page\s+\d+\s+of\s+\d+/gi, '')
    .trim();

  if (!normalized) return '';
  const sentences = normalized
    .split(/(?<=[.?!])\s+/)
    .filter((line) => {
      if (line.length < 30 || line.length > 250) return false;
      // Skip technical spec lines
      if (/(?:should\s+(?:be|have)|must\s+(?:be|have|consist)|shall\s+(?:be|have)|mm\s+of\s+Hg|vacuum\s+level)/i.test(line)) return false;
      return true;
    });

  return sanitize(sentences.slice(0, 3).join(' '));
}

async function loadPdfJs() {
  if (pdfJsModulePromise) return pdfJsModulePromise;

  pdfJsModulePromise = Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, workerUrl]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    return pdfjs;
  });

  return pdfJsModulePromise;
}

async function readPdfText(file) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();

    if (pageText) pages.push(pageText);
  }

  return pages.join('\n');
}


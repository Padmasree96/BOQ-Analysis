function readJsonValue(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;

  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readJsonObject(value) {
  const parsed = readJsonValue(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function readJsonArray(value) {
  const parsed = readJsonValue(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function sanitizeBudget(value) {
  if (value == null || value === '') return '';
  return String(value).replace(/,/g, '').trim();
}

function sanitizeText(value, fallback = '') {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function normalizeProjectRecord(project = {}) {
  const extractionData = readJsonObject(project.extraction_data);
  const filePaths = readJsonObject(extractionData.file_paths);
  const invitedVendors = readJsonArray(project.invited_vendors);
  const budgetValue = sanitizeBudget(project.budget ?? extractionData.estimated_value);

  return {
    ...project,
    extraction_data: extractionData,
    invited_vendors: invitedVendors,
    project_name: sanitizeText(project.project_name || project.name || extractionData.project_name, 'Untitled Project'),
    client_name: sanitizeText(project.client_name || project.client || extractionData.client_name),
    project_type: sanitizeText(project.project_type || extractionData.project_type),
    location: sanitizeText(project.location || extractionData.location),
    estimated_value: budgetValue,
    budget: budgetValue,
    currency: sanitizeText(project.currency || extractionData.currency, 'INR'),
    deadline: sanitizeText(project.deadline || extractionData.deadline),
    description: sanitizeText(project.description || extractionData.description),
    contact_person: sanitizeText(project.contact_person || extractionData.contact_person),
    contact_email: sanitizeText(project.contact_email || extractionData.contact_email),
    tender_number: sanitizeText(project.tender_number || extractionData.tender_number),
    extraction_status: sanitizeText(project.extraction_status || extractionData.extraction_status, 'pending'),
    gi_file_path: sanitizeText(project.gi_file_path || filePaths.general_info),
    boq_file_path: sanitizeText(project.boq_file_path || filePaths.boq),
    tender_file_path: sanitizeText(project.tender_file_path || filePaths.tender),
    spec_file_path: sanitizeText(project.spec_file_path || filePaths.spec),
    makes_file_path: sanitizeText(project.makes_file_path || filePaths.makes),
    vendor_count: Number(project.vendor_count ?? 0) || 0,
  };
}

export function buildProjectInsertPayload(userId, projectInfo = {}, options = {}) {
  const existingExtractionData = readJsonObject(projectInfo.extraction_data);

  return {
    user_id: userId ?? projectInfo.user_id ?? null,
    name: sanitizeText(projectInfo.project_name || projectInfo.name, 'Untitled Project'),
    client: sanitizeText(projectInfo.client_name || projectInfo.client),
    budget: sanitizeBudget(projectInfo.estimated_value ?? projectInfo.budget),
    status: sanitizeText(projectInfo.status, 'active'),
    vendor_count: Number(projectInfo.vendor_count ?? 0) || 0,
    deadline: sanitizeText(projectInfo.deadline) || null,
    description: sanitizeText(projectInfo.description),
    extraction_data: {
      ...existingExtractionData,
      project_name: sanitizeText(projectInfo.project_name || projectInfo.name, 'Untitled Project'),
      client_name: sanitizeText(projectInfo.client_name || projectInfo.client),
      project_type: sanitizeText(projectInfo.project_type),
      location: sanitizeText(projectInfo.location),
      currency: sanitizeText(projectInfo.currency, 'INR'),
      contact_person: sanitizeText(projectInfo.contact_person),
      contact_email: sanitizeText(projectInfo.contact_email),
      tender_number: sanitizeText(projectInfo.tender_number),
      extraction_status: options.extractionRequested ? 'queued' : sanitizeText(projectInfo.extraction_status, 'pending'),
      file_paths: readJsonObject(projectInfo.file_paths),
    },
    invited_vendors: Array.isArray(projectInfo.invited_vendors) ? projectInfo.invited_vendors : [],
  };
}

export function buildProjectUpdatePayload(existingProject = {}, updates = {}) {
  const currentProject = normalizeProjectRecord(existingProject);
  const nextExtractionData = {
    ...currentProject.extraction_data,
    file_paths: readJsonObject(currentProject.extraction_data.file_paths),
  };
  const payload = {};
  let hasExtractionUpdate = false;

  if ('project_name' in updates || 'name' in updates) {
    const nextName = sanitizeText(updates.project_name || updates.name, currentProject.project_name);
    payload.name = nextName;
    nextExtractionData.project_name = nextName;
    hasExtractionUpdate = true;
  }

  if ('client_name' in updates || 'client' in updates) {
    const nextClient = sanitizeText(updates.client_name || updates.client, currentProject.client_name);
    payload.client = nextClient;
    nextExtractionData.client_name = nextClient;
    hasExtractionUpdate = true;
  }

  if ('estimated_value' in updates || 'budget' in updates) {
    payload.budget = sanitizeBudget(updates.estimated_value ?? updates.budget);
  }

  if ('status' in updates) {
    payload.status = sanitizeText(updates.status, currentProject.status || 'active');
  }

  if ('vendor_count' in updates) {
    payload.vendor_count = Number(updates.vendor_count ?? 0) || 0;
  }

  if ('deadline' in updates) {
    payload.deadline = sanitizeText(updates.deadline) || null;
  }

  if ('description' in updates) {
    payload.description = sanitizeText(updates.description);
  }

  const extractionKeys = [
    'project_type',
    'location',
    'currency',
    'contact_person',
    'contact_email',
    'tender_number',
    'extraction_status',
  ];

  extractionKeys.forEach((key) => {
    if (key in updates) {
      nextExtractionData[key] = sanitizeText(updates[key]);
      hasExtractionUpdate = true;
    }
  });

  if ('file_paths' in updates) {
    nextExtractionData.file_paths = {
      ...nextExtractionData.file_paths,
      ...readJsonObject(updates.file_paths),
    };
    hasExtractionUpdate = true;
  }

  if ('invited_vendors' in updates) {
    payload.invited_vendors = Array.isArray(updates.invited_vendors) ? updates.invited_vendors : [];
  }

  if (hasExtractionUpdate) {
    payload.extraction_data = nextExtractionData;
  }

  return payload;
}

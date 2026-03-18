import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 300000, // 5 minutes — AI takes time
});

// Attach JWT token to every request when set
const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

const BoqService = {
  /** AI extraction with rule-based fallback + learning loop */
  extract(file, industry = 'construction') {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/upload-excel?industry=${industry}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data);
  },

  /** Rule-based extraction only (no AI, fast) */
  extractHeuristic(file, industry = 'construction') {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/extract?industry=${industry}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data);
  },

  /** Analyze extracted items */
  analyze(items) {
    return api.post('/analyze', { items }).then(res => res.data);
  },

  /** Risk assessment */
  getRisk(items) {
    return api.post('/risk', { items }).then(res => res.data);
  },

  /** Knowledge graph stats */
  getGraphStats() {
    return api.get('/graph-stats').then(res => res.data);
  },

  /** LangGraph 6-agent pipeline (SRR + FAISS + LLM) */
  extractLangGraph(file, industry = 'construction') {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/extract-langgraph?industry=${industry}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data);
  },

  /** Fetch vendor list — optionally filter by category and type */
  getVendors: async (category = null, type = null) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (type) params.append('type', type);
    const url = `/vendors${params.toString() ? '?' + params.toString() : ''}`;
    const response = await api.get(url);
    return response.data;
  },

  /** Send quote request email to selected vendors */
  sendVendorQuoteEmail: async ({
    vendorEmails,
    materials,
    projectName = 'Construction Project',
    requesterName = 'Project Manager',
    requesterEmail = '',
    replyByDays = 7,
  }) => {
    const response = await api.post('/email/vendor-quote', {
      vendor_emails: vendorEmails,
      materials: materials,
      project_name: projectName,
      requester_name: requesterName,
      requester_email: requesterEmail,
      reply_by_days: replyByDays,
    });
    return response.data;
  },

  /** Extract materials from a CAD drawing file (.dwg / .dxf / .pdf) */
  extractCAD: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/extract-cad', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /** Compare BOQ items vs CAD items — returns matched/mismatched/missing */
  compare: async ({ boqItems, cadItems, projectName, boqFilename, cadFilename }) => {
    const response = await api.post('/compare', {
      boq_items:        boqItems,
      cad_items:        cadItems,
      project_name:     projectName   || 'Construction Project',
      boq_filename:     boqFilename   || 'BOQ.xlsx',
      cad_filename:     cadFilename   || 'Drawing.dwg',
      qty_tolerance_pct: 10.0,
    });
    return response.data;
  },

  /** Send BOQ vs CAD comparison report to an engineer via email */
  sendEngineerReport: async ({ toEmail, subject, body, projectName }) => {
    const response = await api.post('/email/engineer-report', {
      to_email:     toEmail,
      subject:      subject,
      body:         body,
      project_name: projectName || 'Construction Project',
    });
    return response.data;
  },

  // ── Auth methods ──────────────────────────────────────────────────────────

  /** Attach or remove JWT from all requests */
  setAuthToken,

  /** Register a new engineer account */
  register: async ({ email, password, fullName, company = '' }) => {
    const response = await api.post('/auth/register', {
      email,
      password,
      full_name: fullName,
      company,
    });
    return response.data;
  },

  /** Log in and receive a JWT token */
  login: async ({ email, password }) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  /** Verify token and get current user profile */
  getMe: async (token) => {
    const response = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  /**
   * Auto-send comparison report to logged-in engineer's email.
   * No manual email input needed — uses the account email from the token.
   */
  sendComparisonReportToSelf: async ({ subject, reportBody, projectName }) => {
    const response = await api.post('/auth/send-comparison-report', {
      subject,
      report_body:  reportBody,
      project_name: projectName || 'Construction Project',
    });
    return response.data;
  },
};

export default BoqService;
export const boqService = BoqService;

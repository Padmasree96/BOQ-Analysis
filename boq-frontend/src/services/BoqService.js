import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 300000, // 5 minutes — AI takes time
});

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
};

export default BoqService;

import axios from 'axios';
import { useAuthStore } from '../stores/auth';

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:4317/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

// API helper functions
export const api = {
  // Auth
  login: (credentials: { username: string; password: string }) =>
    apiClient.post('/auth/login', credentials),
  
  logout: () => apiClient.post('/auth/logout'),
  
  getCurrentUser: () => apiClient.get('/auth/me'),

  // Assessments
  getAssessments: (params?: any) => apiClient.get('/assessments', { params }),
  
  getAssessment: (id: string) => apiClient.get(`/assessments/${id}`),
  
  createAssessment: (data: any) => apiClient.post('/assessments', data),
  
  advanceAssessment: (id: string, data: any) => 
    apiClient.post(`/assessments/${id}/advance`, data),

  // RAG
  askQuestion: (data: { question: string; scope?: string[] }) =>
    apiClient.post('/rag/ask', data),
  
  getRAGStats: () => apiClient.get('/rag/stats'),

  // Documents
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/ingest/file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  uploadFiles: (files: File[]) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    return apiClient.post('/ingest/files', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  getIngestionStatus: () => apiClient.get('/ingest/status'),

  // Reports
  generateExecutiveSummary: (assessmentId: string, format: 'pdf' | 'docx' = 'pdf') =>
    apiClient.get(`/reports/assessments/${assessmentId}/executive-summary`, {
      params: { format },
      responseType: 'blob',
    }),

  generateDetailedFindings: (assessmentId: string, format: 'pdf' | 'docx' = 'pdf') =>
    apiClient.get(`/reports/assessments/${assessmentId}/detailed-findings`, {
      params: { format },
      responseType: 'blob',
    }),

  generateCAPRegister: (assessmentId: string, format: 'pdf' | 'docx' | 'xlsx' = 'xlsx') =>
    apiClient.get(`/reports/assessments/${assessmentId}/cap-register`, {
      params: { format },
      responseType: 'blob',
    }),

  // Admin (if user has admin role)
  getUsers: (params?: any) => apiClient.get('/admin/users', { params }),
  
  getAuditLogs: (params?: any) => apiClient.get('/admin/audit', { params }),
  
  getSystemStats: () => apiClient.get('/admin/system-stats'),
};

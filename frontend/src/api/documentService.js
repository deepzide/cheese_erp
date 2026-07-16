import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.document_controller';

export const documentService = {
    getDetails: async (documentId) => {
        return apiRequest(`${BASE}.get_document_details?document_id=${encodeURIComponent(documentId)}`);
    },

    getContent: async (documentId, maxChars = 20000) => {
        return apiRequest(`${BASE}.get_document_content?document_id=${encodeURIComponent(documentId)}&max_chars=${maxChars}`);
    },

    vectorize: async (documentId) => {
        return apiRequest(`${BASE}.vectorize_document_now`, {
            method: 'POST',
            body: JSON.stringify({ document_id: documentId }),
        });
    },

    updateStatus: async (documentId, status) => {
        return apiRequest(`${BASE}.update_document_status`, {
            method: 'POST',
            body: JSON.stringify({ document_id: documentId, status }),
        });
    },

    deleteDocument: async (documentId) => {
        return apiRequest(`${BASE}.delete_document`, {
            method: 'POST',
            body: JSON.stringify({ document_id: documentId }),
        });
    },
};

import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.contact_controller';

export const contactService = {
    listContacts: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_contacts?${searchParams}`);
    },

    getContact: async (contactId) => {
        return apiRequest(`${BASE}.get_contact?contact_id=${contactId}`);
    },

    createContact: async (data) => {
        return apiRequest(`${BASE}.create_contact`, { method: 'POST', body: JSON.stringify(data) });
    },

    updateContact: async (contactId, data) => {
        return apiRequest(`${BASE}.update_contact`, { method: 'POST', body: JSON.stringify({ contact_id: contactId, ...data }) });
    },
};

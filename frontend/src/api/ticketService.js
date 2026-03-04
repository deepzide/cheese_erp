import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.ticket_controller';

export const ticketService = {
    listTickets: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_tickets?${searchParams}`);
    },

    getTicketBoard: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null) searchParams.append(k, v); });
        return apiRequest(`${BASE}.get_ticket_board?${searchParams}`);
    },

    getTicketSummary: async (ticketId) => {
        return apiRequest(`${BASE}.get_ticket_summary?ticket_id=${ticketId}`);
    },

    createPendingTicket: async (data) => {
        return apiRequest(`${BASE}.create_pending_ticket`, {
            method: 'POST', body: JSON.stringify(data),
        });
    },

    confirmTicket: async (ticketId) => {
        return apiRequest(`${BASE}.confirm_ticket`, {
            method: 'POST', body: JSON.stringify({ ticket_id: ticketId }),
        });
    },

    rejectTicket: async (ticketId, reason = null) => {
        return apiRequest(`${BASE}.reject_ticket`, {
            method: 'POST', body: JSON.stringify({ ticket_id: ticketId, reason }),
        });
    },

    cancelTicket: async (ticketId) => {
        return apiRequest(`${BASE}.cancel_ticket`, {
            method: 'POST', body: JSON.stringify({ ticket_id: ticketId }),
        });
    },

    markNoShow: async (ticketId, reason = null) => {
        return apiRequest(`${BASE}.mark_no_show`, {
            method: 'POST', body: JSON.stringify({ ticket_id: ticketId, reason }),
        });
    },

    updateTicketStatus: async (ticketId, newStatus, reason = null) => {
        return apiRequest(`${BASE}.update_ticket_status`, {
            method: 'POST', body: JSON.stringify({ ticket_id: ticketId, new_status: newStatus, reason }),
        });
    },

    getEstablishmentTicketBoard: async (establishmentId, date = null) => {
        const params = new URLSearchParams({ establishment_id: establishmentId });
        if (date) params.append('date', date);
        return apiRequest(`${BASE}.get_establishment_ticket_board?${params}`);
    },
};

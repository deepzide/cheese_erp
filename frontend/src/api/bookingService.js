import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.booking_controller';

export const bookingService = {
    createPendingBooking: async (data) => {
        return apiRequest(`${BASE}.create_pending_booking`, { method: 'POST', body: JSON.stringify(data) });
    },

    getBookingStatus: async (bookingId) => {
        return apiRequest(`${BASE}.get_booking_status?booking_id=${bookingId}`);
    },

    modifyBookingPreview: async (bookingId, changes) => {
        return apiRequest(`${BASE}.modify_booking_preview`, { method: 'POST', body: JSON.stringify({ booking_id: bookingId, changes }) });
    },

    confirmBookingModification: async (bookingId, changes) => {
        return apiRequest(`${BASE}.confirm_booking_modification`, { method: 'POST', body: JSON.stringify({ booking_id: bookingId, changes }) });
    },

    cancelBooking: async (bookingId, reason = null) => {
        return apiRequest(`${BASE}.cancel_booking`, { method: 'POST', body: JSON.stringify({ booking_id: bookingId, reason }) });
    },

    getPaymentStatus: async (bookingId) => {
        return apiRequest(`${BASE}.get_payment_status_for_booking?booking_id=${bookingId}`);
    },

    registerPayment: async (bookingId, amount, verificationMethod = 'Manual') => {
        return apiRequest(`${BASE}.register_payment_for_booking`, { method: 'POST', body: JSON.stringify({ booking_id: bookingId, amount, verification_method: verificationMethod }) });
    },
};

import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.room_controller';

export const roomService = {
    listRooms: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v) searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_rooms?${searchParams}`);
    },
    bulkCreate: async (data) => apiRequest(`${BASE}.bulk_create_rooms`, { method: 'POST', body: JSON.stringify(data) }),
    setStatus: async (roomId, status) => apiRequest(`${BASE}.set_room_status`, { method: 'POST', body: JSON.stringify({ room_id: roomId, status }) }),
    blockRoom: async (data) => apiRequest(`${BASE}.block_room`, { method: 'POST', body: JSON.stringify(data) }),
    deleteRoom: async (roomId) => apiRequest(`${BASE}.delete_room`, { method: 'POST', body: JSON.stringify({ room_id: roomId }) }),
    bulkSetStatus: async (roomIds, status) => apiRequest(`${BASE}.bulk_set_room_status`, { method: 'POST', body: JSON.stringify({ room_ids: roomIds, status }) }),
    bulkBlock: async (data) => apiRequest(`${BASE}.bulk_block_rooms`, { method: 'POST', body: JSON.stringify(data) }),
    bulkDelete: async (roomIds) => apiRequest(`${BASE}.bulk_delete_rooms`, { method: 'POST', body: JSON.stringify({ room_ids: roomIds }) }),
    releaseStay: async (stayId) => apiRequest(`${BASE}.release_stay`, { method: 'POST', body: JSON.stringify({ stay_id: stayId }) }),
    getTicketRooms: async (ticketId) => apiRequest(`${BASE}.get_ticket_rooms?ticket_id=${encodeURIComponent(ticketId)}`),
    assignRoom: async (ticketId, roomId) => apiRequest(`${BASE}.assign_room`, { method: 'POST', body: JSON.stringify({ ticket_id: ticketId, room_id: roomId }) }),
};

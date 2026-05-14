import { apiRequest } from "./client";

const BASE = "/api/method/cheese.api.v1.conversation_controller";

export const conversationService = {
    listConversations: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value != null && value !== "") {
                searchParams.append(key, value);
            }
        });
        return apiRequest(`${BASE}.list_conversations?${searchParams}`);
    },
};

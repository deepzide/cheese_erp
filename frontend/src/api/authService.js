import { apiRequest, setStoredCredentials, getStoredCredentials, clearStoredCredentials } from './client';

const TOKEN_ENDPOINT = '/api/method/cheese.api.v1.auth_controller.token';
const LOGOUT_ENDPOINT = '/api/method/cheese.api.v1.auth_controller.logout';

const normalizeTokenPayload = (response = {}, defaults = {}) => {
    const data = response?.message || response?.data?.message || response?.data || response || {};
    return {
        api_key: data?.api_key || defaults?.api_key || '',
        api_secret: data?.api_secret || defaults?.api_secret || '',
        user: data?.user || defaults?.user || '',
        full_name: data?.full_name || defaults?.full_name || '',
        email: data?.email || defaults?.email || '',
        permissions: data?.permissions || defaults?.permissions || [],
    };
};

export const authService = {
    login: async (username, password) => {
        if (!username || !password) {
            throw { message: 'Username and password are required', code: 'INVALID_DATA', status: 400 };
        }
        try {
            const response = await apiRequest(TOKEN_ENDPOINT, {
                method: 'POST',
                body: JSON.stringify({ grant_type: 'password', username, password }),
            });
            const responseData = response?.data || response;
            const payload = normalizeTokenPayload(responseData, { user: username, email: username });
            if (!payload.api_key || !payload.api_secret) {
                throw { message: 'Failed to obtain API credentials.', code: 'AUTH_FAILED', status: 401 };
            }
            setStoredCredentials(payload);
            return payload;
        } catch (error) {
            if (error?.code === 'UNAUTHENTICATED' || error?.status === 401) {
                throw { message: error?.message || 'Invalid username or password', code: 'UNAUTHENTICATED', status: 401 };
            }
            throw error;
        }
    },

    checkSession: async () => {
        const credentials = getStoredCredentials();
        if (!credentials || !credentials.api_key || !credentials.api_secret) {
            throw { message: 'No valid session found', code: 'UNAUTHENTICATED', status: 401 };
        }
        return credentials;
    },

    logout: async () => {
        try {
            await apiRequest(LOGOUT_ENDPOINT, { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            clearStoredCredentials();
        }
    },
};

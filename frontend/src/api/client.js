/**
 * Shared API Client for Cheese
 * Handles dynamic Base URL configuration and generic API requests
 */

export const BASE_URL_STORAGE_KEY = 'cheese_api_base_url';
export const AUTH_STORAGE_KEY = 'cheese_auth_credentials';
const API_KEY_STORAGE = 'cheese_api_key';
const API_SECRET_STORAGE = 'cheese_api_secret';

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const getBaseUrl = () => {
    const storedUrl = localStorage.getItem(BASE_URL_STORAGE_KEY);
    if (storedUrl) return storedUrl;
    return DEFAULT_BASE_URL;
};

export const setBaseUrl = (url) => {
    if (url) {
        localStorage.setItem(BASE_URL_STORAGE_KEY, url);
    } else {
        localStorage.removeItem(BASE_URL_STORAGE_KEY);
    }
};

const normalizeCredentials = (payload = {}) => {
    return {
        api_key: payload?.api_key || '',
        api_secret: payload?.api_secret || '',
        user: payload?.user || payload?.name || '',
        name: payload?.name || payload?.user || '',
        full_name: payload?.full_name || '',
        email: payload?.email || '',
        permissions: payload?.permissions || [],
        role_profile_name: payload?.role_profile_name || '',
        custom_role_profile_name: payload?.custom_role_profile_name || '',
        roles: payload?.roles || [],
        ...Object.fromEntries(
            Object.entries(payload || {}).filter(([key]) =>
                !['api_key', 'api_secret', 'user', 'name', 'full_name', 'email', 'permissions'].includes(key)
            )
        ),
    };
};

export const setStoredCredentials = (payload) => {
    if (!payload) return;
    const normalized = normalizeCredentials(payload);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalized));
    if (normalized?.api_key) localStorage.setItem(API_KEY_STORAGE, normalized.api_key);
    if (normalized?.api_secret) localStorage.setItem(API_SECRET_STORAGE, normalized.api_secret);
};

export const getStoredCredentials = () => {
    const rawValue = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!rawValue) return null;
    try {
        const parsed = JSON.parse(rawValue);
        return normalizeCredentials(parsed);
    } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(API_KEY_STORAGE);
        localStorage.removeItem(API_SECRET_STORAGE);
        return null;
    }
};

export const clearStoredCredentials = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(API_KEY_STORAGE);
    localStorage.removeItem(API_SECRET_STORAGE);
};

export const getApiKey = () => {
    const credentials = getStoredCredentials();
    if (credentials?.api_key) return credentials.api_key;
    return localStorage.getItem(API_KEY_STORAGE) || null;
};

export const getApiSecret = () => {
    const credentials = getStoredCredentials();
    if (credentials?.api_secret) return credentials.api_secret;
    return localStorage.getItem(API_SECRET_STORAGE) || null;
};

const stripHtmlTags = (str) => {
    if (!str || typeof str !== 'string') return str;
    const tmp = document.createElement('DIV');
    tmp.innerHTML = str;
    let text = tmp.textContent || tmp.innerText || '';
    text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim();
    return text;
};

export const extractErrorMessage = (error) => {
    let errorMessage = null;
    if (error?._server_messages) {
        try {
            const serverMessages = JSON.parse(error._server_messages);
            if (Array.isArray(serverMessages) && serverMessages.length > 0) {
                const firstMessage = JSON.parse(serverMessages[0]);
                if (firstMessage?.message) errorMessage = firstMessage.message;
            }
        } catch (e) { }
    }
    if (!errorMessage && error?.message) {
        if (typeof error.message === 'string') errorMessage = error.message;
        else if (error.message?.error?.message) errorMessage = error.message.error.message;
        else if (error.message?.error) errorMessage = typeof error.message.error === 'string' ? error.message.error : JSON.stringify(error.message.error);
    }
    if (!errorMessage) {
        if (typeof error?.error?.message === 'string') errorMessage = error.error.message;
        else if (typeof error?.exc === 'string') errorMessage = error.exc;
    }
    if (errorMessage) return stripHtmlTags(errorMessage);
    return 'An error occurred';
};

export const apiRequest = async (endpoint, options = {}) => {
    const baseUrl = getBaseUrl();
    const isAbsoluteUrl = /^https?:\/\//i.test(endpoint);
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const url = isAbsoluteUrl ? endpoint : `${cleanBaseUrl}${cleanEndpoint}`;

    const credentials = getStoredCredentials();
    const defaultHeaders = { 'Accept': 'application/json' };

    if (options.body && !(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
    }
    if (credentials?.api_key && credentials?.api_secret) {
        defaultHeaders['Authorization'] = `token ${credentials.api_key}:${credentials.api_secret}`;
    }

    const config = { ...options, headers: { ...defaultHeaders, ...options.headers } };

    try {
        const response = await fetch(url, config);
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');
        const data = isJson ? await response.json() : await response.text();

        if (!response.ok) {
            if (response.status === 401 && !endpoint.includes('auth_controller.token')) {
                clearStoredCredentials();
                throw { message: 'Session expired. Please login again.', code: 'UNAUTHENTICATED', status: 401 };
            }
            const errorMessage = extractErrorMessage(data) || `HTTP error! status: ${response.status}`;
            throw { message: errorMessage, code: data?.error?.code || `HTTP_${response.status}`, details: data?.error?.details || {}, status: response.status };
        }
        return { success: true, data };
    } catch (error) {
        if (error.status) throw error;
        throw { message: error.message || 'Network error. Please check your connection.', code: 'NETWORK_ERROR', details: {}, status: 0 };
    }
};

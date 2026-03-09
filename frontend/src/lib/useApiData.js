import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/api/client';

/**
 * Generic hook for fetching data from any API service function.
 * Wraps react-query useQuery with consistent error handling.
 */
export function useApiQuery(queryKey, fetchFn, options = {}) {
    return useQuery({
        queryKey: Array.isArray(queryKey) ? queryKey : [queryKey],
        queryFn: async () => {
            const result = await fetchFn();
            // Handle Frappe's nested response: { data: { message: { success, data, meta } } }
            const payload = result?.data?.message || result?.data || result;
            if (payload?.success === false) {
                throw new Error(payload?.error?.message || 'API request failed');
            }
            return payload;
        },
        ...options,
    });
}

/**
 * Generic hook for Frappe resource list API: /api/resource/{DOCTYPE}
 * Supports filters, fields, pagination, ordering.
 */
export function useFrappeList(doctype, { filters = {}, fields = ['*'], pageSize = 100, orderBy = 'modified desc', enabled = true } = {}) {
    const queryKey = ['frappe-list', doctype, JSON.stringify(filters), fields.join(','), pageSize, orderBy];

    return useQuery({
        queryKey,
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append('order_by', orderBy);
            params.append('limit_page_length', pageSize);

            if (fields.length > 0 && fields[0] !== '*') {
                params.append('fields', JSON.stringify(fields));
            }

            // Add filters - handle both simple {key: value} and complex {key: ["operator", value]}
            const filterEntries = Object.entries(filters).filter(([, v]) => v != null && v !== '');
            if (filterEntries.length > 0) {
                const frappeFilters = filterEntries.map(([key, value]) => {
                    if (Array.isArray(value)) {
                        // Complex filter like ["between", [...]] or ["like", "%term%"]
                        return [doctype, key, value[0], value[1]];
                    }
                    return [doctype, key, '=', value];
                });
                params.append('filters', JSON.stringify(frappeFilters));
            }

            const result = await apiRequest(`/api/resource/${encodeURIComponent(doctype)}?${params}`);
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || payload || [];
        },
        enabled,
    });
}

/**
 * Generic hook for Frappe single resource: /api/resource/{DOCTYPE}/{NAME}
 */
export function useFrappeDoc(doctype, name, options = {}) {
    return useQuery({
        queryKey: ['frappe-doc', doctype, name],
        queryFn: async () => {
            if (!name) return null;
            const result = await apiRequest(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || payload;
        },
        enabled: !!name,
        ...options,
    });
}

/**
 * Generic mutation for Frappe resource create: POST /api/resource/{DOCTYPE}
 */
export function useFrappeCreate(doctype) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data) => {
            const result = await apiRequest(`/api/resource/${encodeURIComponent(doctype)}`, {
                method: 'POST',
                body: JSON.stringify(data),
            });
            return result?.data?.message || result?.data || result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['frappe-list', doctype] });
        },
    });
}

/**
 * Generic mutation for Frappe resource update: PUT /api/resource/{DOCTYPE}/{NAME}
 */
export function useFrappeUpdate(doctype) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ name, data }) => {
            const result = await apiRequest(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
            return result?.data?.message || result?.data || result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['frappe-list', doctype] });
            queryClient.invalidateQueries({ queryKey: ['frappe-doc', doctype] });
        },
    });
}

/**
 * Generic mutation for Frappe resource delete: DELETE /api/resource/{DOCTYPE}/{NAME}
 */
export function useFrappeDelete(doctype) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (name) => {
            const result = await apiRequest(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
                method: 'DELETE',
            });
            return result?.data?.message || result?.data || result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['frappe-list', doctype] });
        },
    });
}

/**
 * Hook for custom API method mutations (POST)
 */
export function useApiMutation(mutationFn, { invalidateKeys = [], onSuccessCb } = {}) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (args) => {
            const result = await mutationFn(args);
            const payload = result?.data?.message || result?.data || result;
            if (payload?.success === false) {
                throw new Error(payload?.error?.message || 'Operation failed');
            }
            return payload;
        },
        onSuccess: (data) => {
            invalidateKeys.forEach(key => {
                queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
            });
            onSuccessCb?.(data);
        },
    });
}

/**
 * Extract nested API response data consistently.
 * Handles: { data: { message: { data: [...] } } } or { data: [...] } or direct arrays.
 */
export function extractData(response, fallback = []) {
    if (!response) return fallback;
    const payload = response?.data?.message || response?.data || response;
    if (payload?.data !== undefined) return payload.data;
    if (Array.isArray(payload)) return payload;
    return payload || fallback;
}

export function extractMeta(response) {
    if (!response) return null;
    const payload = response?.data?.message || response?.data || response;
    return payload?.meta || null;
}

import { apiRequest } from './client';

const BASE = '/api/method/cheese.api.v1.currency_controller';

export const currencyService = {
    getSupportedCurrencies: async () => apiRequest(`${BASE}.get_supported_currencies`),

    convert: async (amount, fromCurrency, toCurrency) =>
        apiRequest(`${BASE}.convert_currency`, {
            method: 'POST',
            body: JSON.stringify({ amount, from_currency: fromCurrency, to_currency: toCurrency }),
        }),

    listConversionLogs: async (params = {}) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') searchParams.append(k, v); });
        return apiRequest(`${BASE}.list_conversion_logs?${searchParams}`);
    },
};

import { apiRequest } from './client';

/** Uses Frappe REST API so workers always honor DocType delete rules (on_trash, permissions). */
export const bankAccountService = {
    deleteBankAccount: async (bankAccountId) =>
        apiRequest(
            `/api/resource/${encodeURIComponent('Cheese Bank Account')}/${encodeURIComponent(bankAccountId)}`,
            { method: 'DELETE' },
        ),
};

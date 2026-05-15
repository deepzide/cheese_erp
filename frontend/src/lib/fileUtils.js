import { getBaseUrl, getStoredCredentials } from "@/api/client";

/**
 * Open a Frappe File record in a new tab. Private files are fetched with API
 * token auth because direct /private/files URLs do not receive Authorization headers.
 */
export async function openFile(file) {
    const fileUrl = file?.file_url;
    if (!fileUrl) return;

    const baseUrl = getBaseUrl();
    const absolutePublicUrl = fileUrl.startsWith("http")
        ? fileUrl
        : `${baseUrl}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`;

    if (!file.is_private) {
        window.open(absolutePublicUrl, "_blank", "noopener,noreferrer");
        return;
    }

    const params = new URLSearchParams({ file_url: fileUrl });
    const downloadUrl = `${baseUrl}/api/method/frappe.handler.download_file?${params}`;

    const headers = { Accept: "*/*" };
    const credentials = getStoredCredentials();
    if (credentials?.api_key && credentials?.api_secret) {
        headers.Authorization = `token ${credentials.api_key}:${credentials.api_secret}`;
    }

    const response = await fetch(downloadUrl, { headers, credentials: "include" });
    if (!response.ok) {
        throw new Error("Failed to open file");
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
        URL.revokeObjectURL(blobUrl);
        throw new Error("Pop-up blocked. Allow pop-ups to view the file.");
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

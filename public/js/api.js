/**
 * Quantum Vault - Centralized API Client
 * Configurable base URL, robust error handling, and typed responses.
 */

class QuantumVaultAPI {
    constructor() {
        const storedBaseUrl = localStorage.getItem("qv_api_base_url");
        if (storedBaseUrl) {
            this.baseUrl = storedBaseUrl.replace(/\/+$/, "");
        } else if (window.location.origin && window.location.origin !== "null" && !window.location.origin.startsWith("file:")) {
            this.baseUrl = window.location.origin;
        } else {
            this.baseUrl = "http://localhost:3000";
        }
    }

    setBaseUrl(url) {
        if (!url) {
            this.baseUrl = window.location.origin || "http://localhost:3000";
            localStorage.removeItem("qv_api_base_url");
        } else {
            this.baseUrl = url.trim().replace(/\/+$/, "");
            localStorage.setItem("qv_api_base_url", this.baseUrl);
        }
    }

    getBaseUrl() {
        return this.baseUrl;
    }

    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            ...(options.headers || {})
        };

        const config = {
            method: options.method || "GET",
            headers
        };

        if (options.body && !(options.body instanceof FormData)) {
            headers["Content-Type"] = "application/json";
            config.body = JSON.stringify(options.body);
        } else if (options.body instanceof FormData) {
            // Note: Let the browser set Content-Type with boundary for FormData
            config.body = options.body;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000);
            config.signal = controller.signal;

            const res = await fetch(url, config);
            clearTimeout(timeoutId);

            let data;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                data = await res.json();
            } else {
                data = await res.text();
            }

            if (!res.ok) {
                const errorMsg = (data && data.error) || (data && data.message) || `HTTP error ${res.status}`;
                const error = new Error(errorMsg);
                error.status = res.status;
                error.data = data;
                throw error;
            }

            return data;
        } catch (err) {
            if (err.name === "AbortError") {
                const timeoutError = new Error("Network request timed out. Check backend connectivity.");
                timeoutError.status = 408;
                throw timeoutError;
            }
            throw err;
        }
    }

    // Health check
    async checkHealth() {
        return this._request("/health");
    }

    // Vault Files
    async listFiles() {
        return this._request("/files");
    }

    // Secure File Upload with Progress
    uploadFile(file, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const url = `${this.baseUrl}/upload`;
            const formData = new FormData();
            formData.append("file", file);

            xhr.open("POST", url, true);

            if (xhr.upload && typeof onProgress === "function") {
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = Math.round((event.loaded / event.total) * 100);
                        onProgress(percentComplete);
                    }
                };
            }

            xhr.onload = () => {
                let responseData;
                try {
                    responseData = JSON.parse(xhr.responseText);
                } catch (e) {
                    responseData = xhr.responseText;
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(responseData);
                } else {
                    const errorMsg = (responseData && responseData.error) || (responseData && responseData.message) || `Upload failed with status ${xhr.status}`;
                    const error = new Error(errorMsg);
                    error.status = xhr.status;
                    error.data = responseData;
                    reject(error);
                }
            };

            xhr.onerror = () => {
                reject(new Error("Network failure occurred during file upload. Verify that the server is online."));
            };

            xhr.ontimeout = () => {
                reject(new Error("File upload timed out."));
            };

            xhr.send(formData);
        });
    }

    // Decrypt File (supports manual three-fragment entry)
    async decryptFile(fileId, manualFragments = null) {
        const body = { fileId };
        if (manualFragments) {
            body.fragment1 = manualFragments.fragment1;
            body.fragment2 = manualFragments.fragment2;
            body.fragment3 = manualFragments.fragment3;
        }
        return this._request("/decrypt", {
            method: "POST",
            body
        });
    }

    // Preview Decrypted Text File
    async previewFile(fileId) {
        return this._request(`/preview/${encodeURIComponent(fileId)}`);
    }

    // Check-In (Dead-Man Switch with optional custom timeout)
    async checkIn(fileId, timeoutSeconds = null) {
        const body = { fileId };
        if (timeoutSeconds !== null && timeoutSeconds !== undefined && timeoutSeconds !== "") {
            body.timeoutSeconds = timeoutSeconds;
        }
        return this._request("/checkin", {
            method: "POST",
            body
        });
    }

    // Set Dead-Man Switch Custom Timeout
    async setDeadManTimeout(fileId, timeoutSeconds) {
        return this._request("/deadman/timeout", {
            method: "POST",
            body: { fileId, timeoutSeconds }
        });
    }

    // Dead-Man Switch Status
    async getDeadManStatus(fileId) {
        return this._request(`/deadman/status/${encodeURIComponent(fileId)}`);
    }

    // Recovery Requests
    async createRecoveryRequest(fileId) {
        return this._request("/recovery/request", {
            method: "POST",
            body: { fileId }
        });
    }

    async getRecoveryStatus(fileId) {
        return this._request(`/recovery/status/${encodeURIComponent(fileId)}`);
    }

    async listRecoveryRequests() {
        return this._request("/recovery/requests");
    }

    async approveRecovery(fileId) {
        return this._request("/recovery/approve", {
            method: "POST",
            body: { fileId }
        });
    }

    async denyRecovery(fileId) {
        return this._request("/recovery/deny", {
            method: "POST",
            body: { fileId }
        });
    }

    // Download URL builder
    getDownloadUrl(fileId, type = "decrypted") {
        const query = type === "encrypted" ? "?type=encrypted" : "";
        return `${this.baseUrl}/download/${encodeURIComponent(fileId)}${query}`;
    }
}

// Global instance
window.api = new QuantumVaultAPI();

import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { apiRequest } from "@/api/client";

const ENTITY_DOCTYPE_MAP = {
    Route: { doctype: "Cheese Route", label: "route_info" },
    Experience: { doctype: "Cheese Experience", label: "experience_info" },
};

export default function DocumentCreate() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [form, setForm] = useState({
        entity_type: searchParams.get('entity_type') || "",
        entity_id: searchParams.get('entity_id') || "",
        title: "",
        document_type: "PDF",
        file_url: "",
        language: "EN",
        version: "1.0",
    });
    const [uploading, setUploading] = useState(false);
    const createMutation = useFrappeCreate("Cheese Document");

    const entityConfig = ENTITY_DOCTYPE_MAP[form.entity_type];

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('is_private', '0');
            formData.append('doctype', 'Cheese Document');
            const res = await fetch('/api/method/upload_file', { method: 'POST', body: formData, headers: { 'X-Frappe-CSRF-Token': window.csrf_token || '' } });
            const data = await res.json();
            const url = data?.message?.file_url;
            if (url) {
                setForm(f => ({ ...f, file_url: url }));
                toast.success("File uploaded");
            }
        } catch (err) {
            toast.error("Upload failed");
        }
        setUploading(false);
    };

    const handleSubmit = () => {
        if (!form.entity_type || !form.entity_id || !form.title) { toast.error("Entity type, entity, and title are required"); return; }
        createMutation.mutate({ ...form, status: "ACTIVE" }, {
            onSuccess: () => { toast.success("Document created"); navigate("/cheese/documents"); },
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    return (
        <CreatePageLayout
            title="Upload Document"
            description="Attach a document to a route or experience"
            icon={FileText}
            backPath="/cheese/documents"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel="Upload Document"
        >
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>Entity Type <span className="text-red-500">*</span></Label>
                        <Select value={form.entity_type} onValueChange={(v) => setForm(f => ({ ...f, entity_type: v, entity_id: "" }))}>
                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Route">Route</SelectItem>
                                <SelectItem value="Experience">Experience</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Related {form.entity_type || 'Entity'} <span className="text-red-500">*</span></Label>
                        {entityConfig ? (
                            <FrappeSearchSelect
                                doctype={entityConfig.doctype}
                                label={entityConfig.label}
                                value={form.entity_id}
                                onChange={(v) => setForm(f => ({ ...f, entity_id: v }))}
                                placeholder={`Select ${form.entity_type.toLowerCase()}...`}
                            />
                        ) : (
                            <Input placeholder="Select entity type first" disabled />
                        )}
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Document Title <span className="text-red-500">*</span></Label>
                    <Input placeholder="e.g. Insurance Certificate" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="space-y-2">
                        <Label>Document Type</Label>
                        <Select value={form.document_type} onValueChange={(v) => setForm(f => ({ ...f, document_type: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PDF">PDF</SelectItem>
                                <SelectItem value="IMAGE">Image</SelectItem>
                                <SelectItem value="LINK">Link</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Language</Label>
                        <Select value={form.language} onValueChange={(v) => setForm(f => ({ ...f, language: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="EN">English</SelectItem>
                                <SelectItem value="FR">French</SelectItem>
                                <SelectItem value="AR">Arabic</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Version</Label>
                        <Input placeholder="1.0" value={form.version} onChange={(e) => setForm(f => ({ ...f, version: e.target.value }))} />
                    </div>
                </div>

                {/* File Upload */}
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-border bg-muted/30">
                    <Label className="font-semibold">Attachment</Label>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 px-4 py-2 rounded-md bg-background border border-input hover:bg-muted cursor-pointer transition-colors text-sm">
                            <Upload className="w-4 h-4" />
                            {uploading ? "Uploading..." : "Choose File"}
                            <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                        </label>
                        <span className="text-xs text-muted-foreground">or paste a URL below</span>
                    </div>
                    <Input placeholder="https://..." value={form.file_url} onChange={(e) => setForm(f => ({ ...f, file_url: e.target.value }))} />
                    {form.file_url && <p className="text-xs text-emerald-600 font-medium">✓ {form.file_url}</p>}
                </div>
            </div>
        </CreatePageLayout>
    );
}

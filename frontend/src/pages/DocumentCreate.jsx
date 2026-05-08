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
import { useTranslation } from "react-i18next";

const ENTITY_DOCTYPE_MAP = {
    "Cheese Route": { doctype: "Cheese Route", label: "route_info" },
    "Cheese Experience": { doctype: "Cheese Experience", label: "experience_info" },
};

export default function DocumentCreate() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [form, setForm] = useState({
        entity_type: searchParams.get('entity_type') || "",
        entity_id: searchParams.get('entity_id') || "",
        title: "",
        document_type: "PDF",
        file_url: "",
        language: "Spanish",
        version: "1.0",
    });
    const [uploading, setUploading] = useState(false);
    const createMutation = useFrappeCreate("Cheese Document");

    const entityConfig = ENTITY_DOCTYPE_MAP[form.entity_type];

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // The File doctype needs a valid `attached_to_name` (docname) and doctype.
        // We attach uploaded documents directly to the selected Route/Experience.
        if (!form.entity_type || !form.entity_id) {
            toast.error(t("common.selectTypeFirst", "Select an entity (type + ID) before uploading a file"));
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('is_private', '0');
            formData.append('doctype', form.entity_type);
            formData.append('docname', form.entity_id);
            const result = await apiRequest('/api/method/upload_file', { method: 'POST', body: formData });
            const url = result?.data?.message?.file_url || result?.data?.file_url;
            if (url) {
                setForm(f => ({ ...f, file_url: url }));
                toast.success(t("documents.documentCreated", "File uploaded"));
            } else {
                toast.error(t("documents.createError", "Upload succeeded but no file URL returned"));
            }
        } catch (err) {
            toast.error(err?.message || t("documents.createError", "Upload failed"));
        }
        setUploading(false);
    };

    const handleSubmit = () => {
        if (!form.entity_type || !form.entity_id || !form.title) { toast.error(t("documents.createError", "Entity type, entity, and title are required")); return; }
        // Cheese Document supports: DRAFT / PUBLISHED / ARCHIVED
        createMutation.mutate({ ...form, status: "PUBLISHED" }, {
            onSuccess: () => { toast.success(t("documents.documentCreated", "Document created")); navigate("/cheese/documents"); },
            onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
        });
    };

    return (
        <CreatePageLayout
            title={t("documents.uploadDocument", "Subir documento")}
            description={t("documents.attachDocument", "Adjunta un documento a una ruta o experiencia")}
            icon={FileText}
            backPath="/cheese/documents"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("documents.uploadDocument", "Subir documento")}
        >
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("deposits.entityType", "Tipo de entidad")} <span className="text-red-500">*</span></Label>
                        <Select value={form.entity_type} onValueChange={(v) => setForm(f => ({ ...f, entity_type: v, entity_id: "" }))}>
                            <SelectTrigger><SelectValue placeholder={t("common.selectType", "Select type")} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Cheese Route">{t("routes.route", "Route")}</SelectItem>
                                <SelectItem value="Cheese Experience">{t("experiences.experience", "Experience")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>{t("documents.relatedTo", "Related")} {form.entity_type || t("deposits.entityType", "Entity")} <span className="text-red-500">*</span></Label>
                        {entityConfig ? (
                            <FrappeSearchSelect
                                doctype={entityConfig.doctype}
                                label={entityConfig.label}
                                value={form.entity_id}
                                onChange={(v) => setForm(f => ({ ...f, entity_id: v }))}
                                placeholder={`Seleccionar ${form.entity_type.toLowerCase()}...`}
                            />
                        ) : (
                            <Input placeholder={t("common.selectTypeFirst", "Seleccione un tipo primero...")} disabled />
                        )}
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>{t("documents.title", "Título del documento")} <span className="text-red-500">*</span></Label>
                    <Input placeholder="ej. Certificado de seguro" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="space-y-2">
                        <Label>{t("documents.type", "Tipo de documento")}</Label>
                        <Select value={form.document_type} onValueChange={(v) => setForm(f => ({ ...f, document_type: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PDF">PDF</SelectItem>
                                <SelectItem value="Image">Imagen</SelectItem>
                                <SelectItem value="Link">Enlace</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>{t("documents.language", "Idioma")}</Label>
                        <Select value={form.language} onValueChange={(v) => setForm(f => ({ ...f, language: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="English">Ingles</SelectItem>
                                <SelectItem value="Spanish">Espanol</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>{t("documents.version", "Version")}</Label>
                        <Input placeholder="1.0" value={form.version} onChange={(e) => setForm(f => ({ ...f, version: e.target.value }))} />
                    </div>
                </div>

                {/* File Upload */}
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-border bg-muted/30">
                    <Label className="font-semibold">{form.document_type === "Link" ? t("documents.linkUrl", "URL del enlace") : t("documents.attachment", "Adjunto")}</Label>
                    {form.document_type !== "Link" && (
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 px-4 py-2 rounded-md bg-background border border-input hover:bg-muted cursor-pointer transition-colors text-sm">
                                <Upload className="w-4 h-4" />
                                {uploading ? t("common.loading", "Cargando...") : t("documents.upload", "Elegir archivo")}
                                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                            </label>
                            <span className="text-xs text-muted-foreground">{t("documents.orPasteUrl", "o pega una URL abajo")}</span>
                        </div>
                    )}
                    <Input
                        placeholder={form.document_type === "Link" ? "https://example.com/resource" : "https://..."}
                        value={form.file_url}
                        onChange={(e) => setForm(f => ({ ...f, file_url: e.target.value }))}
                    />
                    {form.file_url && <p className="text-xs text-emerald-600 font-medium">✓ {form.file_url}</p>}
                </div>
            </div>
        </CreatePageLayout>
    );
}

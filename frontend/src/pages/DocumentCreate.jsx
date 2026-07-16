import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import CompanySelect from "@/components/CompanySelect";
import { apiRequest } from "@/api/client";
import { useTranslation } from "react-i18next";

const ENTITY_DOCTYPE_MAP = {
    "Cheese Route": { doctype: "Cheese Route", label: "route_info" },
    "Cheese Experience": { doctype: "Cheese Experience", label: "experience_info" },
    "Company": { doctype: "Company", label: "company_name" },
};

// Where to send the user back to when they opened "New Document" from an
// entity detail page (e.g. an experience). Keeps them inside the upload-edit
// loop for the same experience instead of bouncing them to /cheese/documents.
const ENTITY_RETURN_PATH = {
    "Cheese Route": (id) => `/cheese/routes/${encodeURIComponent(id)}`,
    "Cheese Experience": (id) => `/cheese/experiences/${encodeURIComponent(id)}`,
    "Company": (id) => `/cheese/establishments/${encodeURIComponent(id)}`,
};

export default function DocumentCreate() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialEntityType = searchParams.get('entity_type') || "";
    const initialEntityId = searchParams.get('entity_id') || "";
    const explicitReturnTo = searchParams.get('returnTo') || "";
    const [form, setForm] = useState({
        entity_type: initialEntityType,
        entity_id: initialEntityId,
        title: "",
        description: "",
        document_type: "PDF",
        file_url: "",
        language: "Spanish",
        version: "1.0",
    });
    const [uploading, setUploading] = useState(false);
    const createMutation = useFrappeCreate("Cheese Document");

    const entityConfig = ENTITY_DOCTYPE_MAP[form.entity_type];

    // Resolve where to navigate back to. Priority:
    //   1. Explicit ?returnTo= override (works for any caller).
    //   2. The parent entity's detail page when the user opened this form
    //      from a Cheese Experience / Cheese Route / Company.
    //   3. Fallback to the global Documents list.
    const computeReturnPath = (entityType, entityId) => {
        if (explicitReturnTo) return explicitReturnTo;
        const builder = ENTITY_RETURN_PATH[entityType];
        if (builder && entityId) return builder(entityId);
        return "/cheese/documents";
    };

    const backPath = computeReturnPath(initialEntityType, initialEntityId);

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

    const handleSubmit = ({ keepGoing = false } = {}) => {
        if (!form.entity_type || !form.entity_id || !form.title) { toast.error(t("documents.createError", "Entity type, entity, and title are required")); return; }
        // Cheese Document supports: DRAFT / PUBLISHED / ARCHIVED
        createMutation.mutate({ ...form, status: "PUBLISHED" }, {
            onSuccess: () => {
                toast.success(t("documents.documentCreated", "Document created"));
                if (keepGoing) {
                    // Stay on the form so the user can upload another document
                    // for the same entity without losing context (issue #267).
                    setForm(f => ({
                        ...f,
                        title: "",
                        file_url: "",
                    }));
                    return;
                }
                // Return to the original entity (experience/route/establishment)
                // that the user opened "New Document" from, rather than always
                // bouncing back to the global Documents list.
                navigate(computeReturnPath(form.entity_type, form.entity_id));
            },
            onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
        });
    };

    return (
        <CreatePageLayout
            title={t("documents.uploadDocument", "Subir documento")}
            description={t("documents.attachDocument", "Adjunta un documento a una ruta o experiencia")}
            icon={FileText}
            backPath={backPath}
            onSubmit={() => handleSubmit({ keepGoing: false })}
            isSubmitting={createMutation.isPending}
            submitLabel={t("documents.uploadDocument", "Subir documento")}
            secondaryAction={
                // Lets the user upload several documents for the same entity in
                // a row without losing context (see issue #267).
                initialEntityType && initialEntityId
                    ? {
                          label: t("documents.saveAndAddAnother", "Guardar y subir otro"),
                          onClick: () => handleSubmit({ keepGoing: true }),
                      }
                    : null
            }
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
                                <SelectItem value="Company">{t("experiences.establishment", "Establishment")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>{t("documents.relatedTo", "Related")} {form.entity_type || t("deposits.entityType", "Entity")} <span className="text-red-500">*</span></Label>
                        {entityConfig ? (
                            form.entity_type === "Company" ? (
                                <CompanySelect
                                    label={entityConfig.label}
                                    value={form.entity_id}
                                    onChange={(v) => setForm(f => ({ ...f, entity_id: v }))}
                                    placeholder={`Seleccionar ${form.entity_type.toLowerCase()}...`}
                                />
                            ) : (
                                <FrappeSearchSelect
                                    doctype={entityConfig.doctype}
                                    label={entityConfig.label}
                                    value={form.entity_id}
                                    onChange={(v) => setForm(f => ({ ...f, entity_id: v }))}
                                    placeholder={`Seleccionar ${form.entity_type.toLowerCase()}...`}
                                />
                            )
                        ) : (
                            <Input placeholder={t("common.selectTypeFirst", "Seleccione un tipo primero...")} disabled />
                        )}
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>{t("documents.title", "Título del documento")} <span className="text-red-500">*</span></Label>
                    <Input placeholder="ej. Certificado de seguro" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                    <Label>{t("documents.description", "Descripción")}</Label>
                    <Textarea
                        rows={3}
                        placeholder={t("documents.descriptionPlaceholder", "Describe el contenido del documento — recomendado para imágenes y videos: qué muestra, ofertas, precios, etc.")}
                        value={form.description}
                        onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">{t("documents.descriptionHint", "Se incluye en la búsqueda semántica del bot.")}</p>
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

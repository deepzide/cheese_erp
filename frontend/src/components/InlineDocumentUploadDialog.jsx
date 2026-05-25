import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, FileText } from "lucide-react";
import { apiRequest } from "@/api/client";
import { useFrappeCreate } from "@/lib/useApiData";

/**
 * InlineDocumentUploadDialog — upload one or more Cheese Documents for a
 * given entity without leaving the parent detail page (issue #267).
 *
 * After a successful save the dialog stays open and resets the file/title
 * fields so the operator can attach another document immediately.
 *
 * Props:
 *   open         - whether the dialog is open
 *   onClose      - called when the user closes the dialog
 *   entityType   - normalized doctype name, e.g. "Cheese Experience"
 *   entityId     - parent docname
 *   onUploaded   - optional callback fired after each successful upload
 *                  (receives the created Cheese Document record)
 */
export default function InlineDocumentUploadDialog({
    open,
    onClose,
    entityType,
    entityId,
    onUploaded,
}) {
    const { t } = useTranslation();
    const createMutation = useFrappeCreate("Cheese Document");

    const [form, setForm] = useState({
        title: "",
        document_type: "PDF",
        file_url: "",
        language: "Spanish",
        version: "1.0",
    });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (open) {
            setForm({
                title: "",
                document_type: "PDF",
                file_url: "",
                language: "Spanish",
                version: "1.0",
            });
        }
    }, [open]);

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!entityType || !entityId) {
            toast.error(t("common.selectTypeFirst", "Missing parent entity for upload"));
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("is_private", "0");
            formData.append("doctype", entityType);
            formData.append("docname", entityId);
            const result = await apiRequest("/api/method/upload_file", {
                method: "POST",
                body: formData,
            });
            const url = result?.data?.message?.file_url || result?.data?.file_url;
            if (url) {
                setForm((f) => ({
                    ...f,
                    file_url: url,
                    title: f.title || file.name.replace(/\.[^.]+$/, ""),
                }));
                toast.success(t("documents.fileUploaded", "File uploaded"));
            } else {
                toast.error(t("documents.createError", "Upload succeeded but no file URL returned"));
            }
        } catch (err) {
            toast.error(err?.message || t("documents.createError", "Upload failed"));
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = ({ keepOpen = true } = {}) => {
        if (!entityType || !entityId) {
            toast.error(t("common.selectTypeFirst", "Missing parent entity for upload"));
            return;
        }
        if (!form.title?.trim()) {
            toast.error(t("documents.titleRequired", "Title is required"));
            return;
        }
        if (!form.file_url) {
            toast.error(t("documents.fileRequired", "Upload a file or paste a URL"));
            return;
        }

        createMutation.mutate(
            {
                entity_type: entityType,
                entity_id: entityId,
                title: form.title.trim(),
                document_type: form.document_type,
                file_url: form.file_url,
                language: form.language,
                version: form.version,
                status: "PUBLISHED",
            },
            {
                onSuccess: (created) => {
                    toast.success(t("documents.documentCreated", "Document created"));
                    onUploaded?.(created?.data || created);
                    if (keepOpen) {
                        // Keep the dialog open so the user can attach another
                        // doc without bouncing away from the experience.
                        setForm((f) => ({
                            ...f,
                            title: "",
                            file_url: "",
                        }));
                    } else {
                        onClose?.();
                    }
                },
                onError: (err) =>
                    toast.error(err?.message || t("common.failed", "Failed")),
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-cheese-600" />
                        {t("documents.uploadDocument", "Subir documento")}
                    </DialogTitle>
                    <DialogDescription>
                        {t(
                            "documents.inlineUploadDescription",
                            "Attach a document without leaving this page."
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>
                            {t("documents.title", "Title")}{" "}
                            <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            value={form.title}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, title: e.target.value }))
                            }
                            placeholder={t(
                                "documents.titlePlaceholder",
                                "e.g., Insurance Certificate"
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label className="text-xs">
                                {t("documents.type", "Type")}
                            </Label>
                            <Select
                                value={form.document_type}
                                onValueChange={(v) =>
                                    setForm((f) => ({ ...f, document_type: v }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PDF">PDF</SelectItem>
                                    <SelectItem value="Image">Image</SelectItem>
                                    <SelectItem value="Link">Link</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">
                                {t("documents.language", "Language")}
                            </Label>
                            <Select
                                value={form.language}
                                onValueChange={(v) =>
                                    setForm((f) => ({ ...f, language: v }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="English">English</SelectItem>
                                    <SelectItem value="Spanish">Español</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">
                                {t("documents.version", "Version")}
                            </Label>
                            <Input
                                value={form.version}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, version: e.target.value }))
                                }
                            />
                        </div>
                    </div>

                    <div className="space-y-2 p-3 rounded-md border border-dashed border-border bg-muted/30">
                        <Label className="text-xs font-medium">
                            {form.document_type === "Link"
                                ? t("documents.linkUrl", "Link URL")
                                : t("documents.attachment", "Attachment")}
                        </Label>
                        {form.document_type !== "Link" && (
                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 px-3 py-2 rounded-md bg-background border border-input hover:bg-muted cursor-pointer transition-colors text-sm">
                                    <Upload className="w-4 h-4" />
                                    {uploading
                                        ? t("common.loading", "Loading...")
                                        : t("documents.upload", "Choose file")}
                                    <input
                                        type="file"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                        disabled={uploading}
                                    />
                                </label>
                                <span className="text-xs text-muted-foreground">
                                    {t("documents.orPasteUrl", "or paste a URL below")}
                                </span>
                            </div>
                        )}
                        <Input
                            placeholder={
                                form.document_type === "Link"
                                    ? "https://example.com/resource"
                                    : "https://..."
                            }
                            value={form.file_url}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, file_url: e.target.value }))
                            }
                        />
                        {form.file_url && (
                            <p className="text-xs text-emerald-600 font-medium truncate">
                                ✓ {form.file_url}
                            </p>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        {t("common.close", "Close")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSubmit({ keepOpen: true })}
                        disabled={createMutation.isPending || uploading}
                    >
                        {createMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        ) : null}
                        {t("documents.saveAndAddAnother", "Save and add another")}
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => handleSubmit({ keepOpen: false })}
                        disabled={createMutation.isPending || uploading}
                        className="bg-cheese-500 hover:bg-cheese-600 text-black"
                    >
                        {createMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        ) : (
                            <Upload className="w-3.5 h-3.5 mr-1" />
                        )}
                        {t("documents.uploadDocument", "Upload")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

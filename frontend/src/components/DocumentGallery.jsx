import React, { useState } from "react";
import { FileText, Image as ImageIcon, ExternalLink, X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function DocumentGallery({ documents = [], onAddClick, isLoading = false }) {
    const [selectedDoc, setSelectedDoc] = useState(null);

    if (isLoading) {
        return <div className="p-6 text-sm text-muted-foreground text-center animate-pulse">Loading documents...</div>;
    }

    if (documents.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                <FileText className="w-8 h-8 mb-4 opacity-20" />
                <p>No documents attached yet.</p>
                {onAddClick && (
                    <Button variant="outline" size="sm" className="mt-4" onClick={onAddClick}>
                        <Plus className="w-4 h-4 mr-2" /> Add Document
                    </Button>
                )}
            </div>
        );
    }

    const isImage = (doc) => {
        if (doc.document_type === "IMAGE") return true;
        const url = (doc.file_url || "").toLowerCase();
        return url.endsWith(".png") || url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".gif") || url.endsWith(".webp");
    };

    const isPDF = (doc) => {
        if (doc.document_type === "PDF") return true;
        return (doc.file_url || "").toLowerCase().endsWith(".pdf");
    };

    return (
        <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {documents.map((doc) => {
                    const img = isImage(doc);
                    return (
                        <div
                            key={doc.name}
                            className="group relative flex flex-col items-center justify-center p-2 border border-border/60 rounded-xl hover:bg-muted/30 transition-all cursor-pointer overflow-hidden bg-card hover:shadow-sm"
                            onClick={() => setSelectedDoc(doc)}
                        >
                            <div className="w-full aspect-square flex items-center justify-center bg-muted/20 rounded-lg overflow-hidden relative">
                                {img && doc.file_url ? (
                                    <img src={doc.file_url} alt={doc.title || doc.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                ) : (
                                    <FileText className="w-10 h-10 text-muted-foreground/30" />
                                )}
                            </div>
                            <div className="mt-3 w-full text-center">
                                <p className="text-[11px] font-semibold truncate w-full px-1" title={doc.title || doc.name}>
                                    {doc.title || doc.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate w-full mt-0.5">
                                    {doc.document_type || "FILE"}
                                </p>
                            </div>

                            {/* Hover overlay with Open button for quick access */}
                            <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end p-2 pointer-events-none rounded-t-xl">
                                <button
                                    className="p-1.5 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 text-white pointer-events-auto transition-colors shadow-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(doc.file_url, "_blank");
                                    }}
                                    title="Open in new tab"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {onAddClick && (
                <div className="mt-6 pt-4 border-t border-border/50 flex justify-center">
                    <Button variant="outline" size="sm" onClick={onAddClick} className="shadow-sm">
                        <Plus className="w-4 h-4 mr-2" /> Add Document
                    </Button>
                </div>
            )}

            {/* Document Viewer Modal */}
            <Dialog open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
                <DialogContent className="max-w-5xl w-full h-[85vh] p-0 flex flex-col bg-background/95 backdrop-blur-2xl border-border shadow-2xl overflow-hidden rounded-xl">
                    <DialogHeader className="p-4 border-b border-border/50 bg-muted/10 flex flex-row items-center justify-between sticky top-0 z-10 shrink-0">
                        <DialogTitle className="text-base truncate flex-1 flex items-center gap-2">
                            {selectedDoc && isImage(selectedDoc) ? <ImageIcon className="w-5 h-5 text-primary" /> : <FileText className="w-5 h-5 text-primary" />}
                            {selectedDoc?.title || selectedDoc?.name}
                        </DialogTitle>
                        <div className="flex items-center gap-2 ml-4">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 shadow-sm bg-background/50 backdrop-blur-sm"
                                onClick={() => window.open(selectedDoc?.file_url, "_blank")}
                            >
                                <ExternalLink className="w-3.5 h-3.5 mr-2" /> Open Externally
                            </Button>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0 relative bg-black/5 dark:bg-black/40">
                        {selectedDoc && (
                            <>
                                {isImage(selectedDoc) ? (
                                    <img
                                        src={selectedDoc.file_url}
                                        alt={selectedDoc.title}
                                        className="max-w-full max-h-full object-contain rounded-lg border border-border/50 shadow-sm"
                                    />
                                ) : isPDF(selectedDoc) ? (
                                    <iframe
                                        src={selectedDoc.file_url}
                                        className="w-full h-full rounded-lg bg-white shadow-xl border border-border/50"
                                        title={selectedDoc.title || "PDF Document"}
                                    />
                                ) : (
                                    <div className="text-center bg-card p-12 rounded-xl shadow-sm border border-border/50 flex flex-col items-center">
                                        <FileText className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                                        <h3 className="text-lg font-medium mb-2">Preview Not Available</h3>
                                        <p className="text-muted-foreground mb-6 text-sm">This file type cannot be previewed directly in the browser.</p>
                                        <Button onClick={() => window.open(selectedDoc?.file_url, "_blank")}>
                                            <ExternalLink className="w-4 h-4 mr-2" /> Open Externally
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

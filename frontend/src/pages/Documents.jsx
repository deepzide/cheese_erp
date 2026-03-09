import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search, Plus, Filter, Download, AlertCircle, RefreshCw, Loader2, MoreHorizontal, ExternalLink } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useFrappeList, useFrappeCreate } from "@/lib/useApiData";

const TYPE_BADGE = { PDF: "bg-red-500/15 text-red-700", IMAGE: "bg-blue-500/15 text-blue-700", LINK: "bg-purple-500/15 text-purple-700" };
const STATUS_BADGE = { ACTIVE: "bg-emerald-500/15 text-emerald-700", ARCHIVED: "bg-gray-500/15 text-gray-600", EXPIRED: "bg-red-500/15 text-red-600" };

export default function Documents() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({
        entity_type: searchParams.get('entity_type') || "", entity_id: searchParams.get('entity_id') || "",
        title: "", document_type: "PDF", file_url: "",
    });

    const { data: docs = [], isLoading, error, refetch } = useFrappeList("Cheese Document", {
        fields: ["name", "entity_type", "entity_id", "title", "document_type", "file_url", "status", "language", "version", "validity_date", "tags", "creation"],
        pageSize: 100,
    });

    const createMutation = useFrappeCreate("Cheese Document");

    const filtered = (Array.isArray(docs) ? docs : []).filter(d => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (d.title || d.name || '').toLowerCase().includes(term) || (d.entity_id || '').toLowerCase().includes(term);
        }
        return true;
    });

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" /><h2 className="text-lg font-semibold mb-2">Failed to load documents</h2>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="w-6 h-6 text-cheese-600" /> Documents</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} documents`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => navigate("/cheese/documents/new")}><Plus className="w-4 h-4 mr-1" /> Upload</Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="space-y-3">
                {isLoading ? Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-4 flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-lg" /><div className="flex-1"><Skeleton className="h-4 w-40 mb-2" /><Skeleton className="h-3 w-24" /></div>
                    </CardContent></Card>
                )) : filtered.map((doc) => (
                    <motion.div key={doc.name} whileHover={{ x: 4 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm text-foreground">{doc.title || doc.name}</h3>
                                    <p className="text-xs text-muted-foreground">{doc.entity_type}: {doc.entity_id || '—'} {doc.language ? `• ${doc.language}` : ''} {doc.version ? `• v${doc.version}` : ''}</p>
                                </div>
                                <Badge className={TYPE_BADGE[doc.document_type] || TYPE_BADGE.PDF}>{doc.document_type || '—'}</Badge>
                                <Badge className={STATUS_BADGE[doc.status] || STATUS_BADGE.ACTIVE}>{doc.status || 'ACTIVE'}</Badge>
                                {doc.validity_date && <span className="text-[10px] text-muted-foreground hidden sm:block">Valid: {doc.validity_date}</span>}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {doc.file_url && <DropdownMenuItem onClick={() => window.open(doc.file_url, '_blank')}><ExternalLink className="w-3 h-3 mr-2" /> Open File</DropdownMenuItem>}
                                        {doc.entity_type === 'Route' && <DropdownMenuItem onClick={() => navigate(`/cheese/routes?search=${doc.entity_id}`)}>View Route</DropdownMenuItem>}
                                        {doc.entity_type === 'Experience' && <DropdownMenuItem onClick={() => navigate(`/cheese/experiences?search=${doc.entity_id}`)}>View Experience</DropdownMenuItem>}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><FileText className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No documents found</p></div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> Upload Document</DialogTitle><DialogDescription>Attach a document</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>Entity Type *</Label><Input placeholder="Route / Experience" value={form.entity_type} onChange={(e) => setForm(f => ({ ...f, entity_type: e.target.value }))} /></div>
                            <div className="space-y-2"><Label>Entity ID *</Label><Input placeholder="ID" value={form.entity_id} onChange={(e) => setForm(f => ({ ...f, entity_id: e.target.value }))} /></div>
                        </div>
                        <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label>Type</Label>
                                <Select value={form.document_type} onValueChange={(v) => setForm(f => ({ ...f, document_type: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="PDF">PDF</SelectItem><SelectItem value="IMAGE">Image</SelectItem><SelectItem value="LINK">Link</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2"><Label>File URL</Label><Input value={form.file_url} onChange={(e) => setForm(f => ({ ...f, file_url: e.target.value }))} /></div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={() => createMutation.mutate(form, { onSuccess: () => { setCreateOpen(false); toast.success("Document uploaded"); } })} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Upload
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}

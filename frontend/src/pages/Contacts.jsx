import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, Plus, Phone, Mail, MoreHorizontal, Eye, Trash2, Ticket, AlertCircle, RefreshCw, Loader2, MessageSquare } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useFrappeList, useFrappeCreate, useFrappeDelete } from "@/lib/useApiData";

export default function Contacts() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ full_name: "", phone: "", email: "" });

    const { data: contacts = [], isLoading, error, refetch } = useFrappeList("Cheese Contact", {
        fields: ["name", "full_name", "phone", "email", "creation", "modified"],
        pageSize: 100,
    });

    const createMutation = useFrappeCreate("Cheese Contact");
    const deleteMutation = useFrappeDelete("Cheese Contact");

    const contactsList = Array.isArray(contacts) ? contacts : [];
    const filtered = contactsList.filter(c => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (c.full_name || '').toLowerCase().includes(term) || (c.phone || '').includes(searchTerm) || (c.name || '').toLowerCase().includes(term);
        }
        return true;
    });

    const handleCreate = () => {
        if (!form.full_name || !form.phone) { toast.error("Name and phone are required"); return; }
        createMutation.mutate(form, {
            onSuccess: () => { setForm({ full_name: "", phone: "", email: "" }); setCreateOpen(false); toast.success("Contact created"); },
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    const handleDelete = (name) => {
        deleteMutation.mutate(name, {
            onSuccess: () => toast.success("Contact deleted"),
            onError: (err) => toast.error(err?.message || "Failed"),
        });
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">Failed to load contacts</h2>
                <p className="text-sm text-muted-foreground mb-4">{error?.message}</p>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Retry</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Users className="w-6 h-6 text-cheese-600" /> Contacts</h1>
                    <p className="text-sm text-muted-foreground mt-1">{isLoading ? '...' : `${filtered.length} contacts`}</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search contacts..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => navigate("/cheese/contacts/new")}><Plus className="w-4 h-4 mr-1" /> Add</Button>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9"><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="border border-border"><CardContent className="p-5 space-y-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-48" /></CardContent></Card>
                )) : filtered.map((contact) => (
                    <motion.div key={contact.name} whileHover={{ y: -3 }}>
                        <Card className="border border-border shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={(e) => {
                            if (!e.target.closest('[role="menuitem"]') && !e.target.closest('button')) {
                                navigate(`/cheese/contacts/${contact.name}`);
                            }
                        }}>
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-cheese-100 dark:bg-cheese-900/30 flex items-center justify-center font-bold text-cheese-700 dark:text-cheese-400">{(contact.full_name || '?').charAt(0)}</div>
                                        <div><h3 className="font-semibold text-foreground">{contact.full_name || contact.name}</h3><span className="text-xs text-muted-foreground">{contact.name}</span></div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/contacts/${contact.name}`)}><Eye className="w-3 h-3 mr-2" /> View Details</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/tickets/new?contact=${contact.name}`)}><Ticket className="w-3 h-3 mr-2" /> Create Ticket</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/leads/new?contact=${contact.name}`)}>Create Lead</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/tickets?contact=${contact.name}`)}><Ticket className="w-3 h-3 mr-2" /> View Tickets</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/conversations?contact=${contact.name}`)}><MessageSquare className="w-3 h-3 mr-2" /> Conversations</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => navigate(`/cheese/support/new?contact=${contact.name}`)}>Create Support Case</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(contact.name)}><Trash2 className="w-3 h-3 mr-2" /> Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="space-y-2 text-sm">
                                    {contact.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3.5 h-3.5" /> {contact.phone}</p>}
                                    {contact.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="w-3.5 h-3.5" /> {contact.email}</p>}
                                </div>
                                <div className="mt-3 pt-3 border-t border-border">
                                    <span className="text-[10px] text-muted-foreground">Modified: {contact.modified || contact.creation || '—'}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16"><Users className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" /><p className="text-muted-foreground">No contacts found</p></div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> Add Contact</DialogTitle><DialogDescription>Create a new contact record</DialogDescription></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2"><Label>Name *</Label><Input placeholder="Full name" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Phone *</Label><Input placeholder="+1 555-1234" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                        <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate} disabled={createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Add Contact
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}

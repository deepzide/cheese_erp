import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, AlertCircle, RefreshCw, Mail, Calendar, Plus, Edit2, ShieldOff, CheckCircle2, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { userService } from "@/api/userService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function UsersPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        email: "",
        full_name: "",
        company: "",
        password: "",
        enabled: true
    });

    const { data: payload, isLoading, error, refetch } = useQuery({
        queryKey: ["users"],
        queryFn: async () => {
            const res = await userService.listUsers({ page_size: 200 });
            return res?.data?.message?.data || res?.data?.data || [];
        },
    });

    const { data: companiesPayload } = useQuery({
        queryKey: ["companies_assignment"],
        queryFn: async () => {
            const res = await userService.listCompanies();
            return res?.data?.message?.data?.companies || res?.data?.data?.companies || [];
        },
    });

    const companies = companiesPayload || [];
    const users = Array.isArray(payload) ? payload : [];
    
    const filtered = users.filter((u) => {
        if (!searchTerm) return true;
        const t = searchTerm.toLowerCase();
        return (
            (u.full_name || "").toLowerCase().includes(t) ||
            (u.email || "").toLowerCase().includes(t) ||
            (u.name || "").toLowerCase().includes(t)
        );
    });

    const createMutation = useMutation({
        mutationFn: (data) => userService.createUser(data),
        onSuccess: () => {
            toast.success(t("users.userCreated", "User created successfully"));
            setIsAddOpen(false);
            queryClient.invalidateQueries({ queryKey: ["users"] });
            resetForm();
        },
        onError: (err) => toast.error(err.message || t("users.createFailed", "Failed to create user"))
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => userService.updateUser(id, data),
        onSuccess: () => {
            toast.success(t("users.userUpdated", "User updated successfully"));
            setIsEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ["users"] });
        },
        onError: (err) => toast.error(err.message || t("users.updateFailed", "Failed to update user"))
    });

    const resetForm = () => {
        setFormData({ email: "", full_name: "", company: "", password: "", enabled: true });
        setSelectedUser(null);
    };

    const handleEditClick = (user) => {
        setSelectedUser(user);
        setFormData({
            email: user.email || user.name,
            full_name: user.full_name || "",
            company: (user.companies && user.companies.length > 0) ? user.companies[0] : "",
            password: "",
            enabled: user.enabled === 1
        });
        setIsEditOpen(true);
    };

    const handleSave = () => {
        if (isAddOpen) {
            if (!formData.email || !formData.full_name || !formData.company) {
                toast.error(t("users.emailNameCompanyRequired", "Email, name, and company are required"));
                return;
            }
            createMutation.mutate({
                email: formData.email,
                full_name: formData.full_name,
                company: formData.company,
                password: formData.password || undefined
            });
        } else if (isEditOpen && selectedUser) {
            updateMutation.mutate({
                id: selectedUser.name,
                data: {
                    full_name: formData.full_name,
                    company: formData.company,
                    enabled: formData.enabled ? 1 : 0,
                    password: formData.password || undefined
                }
            });
        }
    };

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold mb-2">{t("users.loadFailed", "Failed to load users")}</h2>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" /> {t("common.retry", "Retry")}
                </Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Users className="w-6 h-6 text-cheese-600" /> {t("users.systemUsers", "System Users")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isLoading ? "…" : t("users.activeUsersCount", { count: filtered.length, defaultValue: `${filtered.length} active users` })}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder={t("users.searchUsers", "Search users...")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-9 w-9">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button onClick={() => { resetForm(); setIsAddOpen(true); }} className="h-9 gap-2">
                        <Plus className="w-4 h-4" /> {t("users.addUser", "Add User")}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i} className="border border-border">
                            <CardContent className="p-5 space-y-3">
                                <Skeleton className="h-5 w-40" />
                                <Skeleton className="h-4 w-full" />
                            </CardContent>
                        </Card>
                    ))
                    : filtered.map((user) => (
                        <motion.div key={user.name} whileHover={{ y: -2 }}>
                            <Card className="border border-border shadow-sm hover:shadow-md transition-all h-full relative overflow-hidden group">
                                <CardContent className="p-5 flex flex-col h-full">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cheese-400 to-amber-500 flex items-center justify-center">
                                                <span className="text-black font-bold text-sm">{(user.full_name || "U").charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-foreground">{user.full_name || user.name}</h3>
                                                <span className="text-xs text-muted-foreground">{user.user_type}</span>
                                            </div>
                                        </div>
                                        <Badge className={user.enabled ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700"}>
                                            {user.enabled ? t("users.active", "Active") : t("users.disabled", "Disabled")}
                                        </Badge>
                                    </div>
                                    <div className="space-y-2 flex-1 text-xs text-muted-foreground mt-2">
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-3.5 h-3.5" /> {user.email || user.name}
                                        </div>
                                        {user.companies && user.companies.length > 0 && (
                                            <div className="flex items-center gap-2 text-cheese-600 font-medium bg-cheese-50 border border-cheese-200 px-2 py-1 rounded w-fit">
                                                <Building2 className="w-3.5 h-3.5" /> {user.companies[0]}
                                            </div>
                                        )}
                                        {user.last_active && (
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-3.5 h-3.5" /> {t("users.lastActive", "Last active")}: {new Date(user.last_active).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button size="sm" variant="secondary" onClick={() => handleEditClick(user)}>
                                            <Edit2 className="w-3.5 h-3.5 mr-1" /> {t("common.edit", "Edit")}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
            </div>

            {!isLoading && filtered.length === 0 && (
                <div className="text-center py-16">
                    <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-muted-foreground">{t("users.noUsersFound", "No users found")}</h3>
                </div>
            )}

            {/* Add / Edit Dialog */}
            <Dialog open={isAddOpen || isEditOpen} onOpenChange={(open) => {
                if (!open) { setIsAddOpen(false); setIsEditOpen(false); resetForm(); }
            }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{isAddOpen ? t("users.addNewUser", "Add New User") : t("users.editUser", "Edit User")}</DialogTitle>
                        <DialogDescription>
                            {isAddOpen ? t("users.createUserDesc", "Create a new establishment user.") : t("users.updateUserDesc", "Update user details and access.")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>{t("users.emailLoginId", "Email (Login ID)")} *</Label>
                            <Input 
                                placeholder={t("users.emailPlaceholder", "user@company.com")} 
                                value={formData.email}
                                onChange={(e) => setFormData({...formData, email: e.target.value})}
                                disabled={isEditOpen} 
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>{t("users.fullName", "Full Name")} *</Label>
                            <Input 
                                placeholder={t("users.fullNamePlaceholder", "John Doe")} 
                                value={formData.full_name}
                                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>{t("users.assignedCompany", "Assigned Company")} *</Label>
                            <Select value={formData.company} onValueChange={(val) => setFormData({...formData, company: val})}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t("users.selectCompany", "Select a company")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies.map(c => (
                                        <SelectItem key={c.name} value={c.name}>{c.company_name || c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>{t("auth.password", "Password")} {isEditOpen && `(${t("users.passwordKeepBlank", "Leave blank to keep unchanged")})`}</Label>
                            <Input 
                                type="password" 
                                placeholder="••••••••" 
                                value={formData.password}
                                onChange={(e) => setFormData({...formData, password: e.target.value})}
                            />
                        </div>
                        {isEditOpen && (
                            <div className="flex items-center justify-between rounded-lg border p-3 mt-2">
                                <div className="space-y-0.5">
                                    <Label className="text-base flex items-center gap-2">
                                        {formData.enabled ? <CheckCircle2 className="w-4 h-4 text-emerald-500"/> : <ShieldOff className="w-4 h-4 text-red-500"/>}
                                        {t("users.activeAccount", "Active Account")}
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                        {t("users.allowLogin", "Allow user to log in")}
                                    </p>
                                </div>
                                <input 
                                    type="checkbox"
                                    className="w-5 h-5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                                    checked={formData.enabled} 
                                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})} 
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setIsAddOpen(false); setIsEditOpen(false); resetForm(); }}>{t("common.cancel", "Cancel")}</Button>
                        <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                            {createMutation.isPending || updateMutation.isPending ? t("common.saving", "Saving...") : t("users.saveUser", "Save User")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}

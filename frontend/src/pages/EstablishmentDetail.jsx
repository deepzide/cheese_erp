import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Building2,
    ArrowLeft,
    RefreshCw,
    Landmark,
    Plus,
    Archive,
    ArchiveRestore,
    Trash2,
    AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { establishmentService } from "@/api/establishmentService";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export default function EstablishmentDetail() {
    const { id } = useParams();
    const companyId = id ? decodeURIComponent(id) : "";
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({});
    const [deleteOpen, setDeleteOpen] = useState(false);

    const { data: payload, isLoading, error, refetch } = useQuery({
        queryKey: ["establishment", companyId],
        queryFn: async () => {
            const res = await establishmentService.getEstablishmentDetails(companyId);
            const msg = res?.data?.message || {};
            if (!msg.success) {
                throw new Error(msg.error?.message || "Failed to load");
            }
            return msg.data;
        },
        enabled: !!companyId,
    });

    React.useEffect(() => {
        if (payload) {
            setForm({
                company_name: payload.company_name || "",
                email: payload.email || "",
                phone_no: payload.phone || "",
                website: payload.website || "",
                company_description: payload.description || "",
            });
        }
    }, [payload]);

    const updateMutation = useMutation({
        mutationFn: () =>
            establishmentService.updateEstablishment(companyId, {
                company_name: form.company_name,
                email: form.email,
                phone_no: form.phone_no,
                website: form.website,
                company_description: form.company_description,
            }),
        onSuccess: (res) => {
            const msg = res?.data?.message || {};
            if (!msg.success) {
                toast.error(msg.error?.message || "Update failed");
                return;
            }
            toast.success("Saved");
            setEditMode(false);
            queryClient.invalidateQueries({ queryKey: ["establishment", companyId] });
            queryClient.invalidateQueries({ queryKey: ["establishments"] });
        },
        onError: (err) => toast.error(err?.message || "Failed"),
    });

    const archiveMutation = useMutation({
        mutationFn: () => establishmentService.archiveEstablishment(companyId),
        onSuccess: (res) => {
            const msg = res?.data?.message || {};
            if (!msg.success) {
                toast.error(msg.error?.message || "Failed");
                return;
            }
            toast.success("Archived");
            refetch();
            queryClient.invalidateQueries({ queryKey: ["establishments"] });
        },
        onError: (err) => toast.error(err?.message || "Failed"),
    });

    const unarchiveMutation = useMutation({
        mutationFn: () => establishmentService.unarchiveEstablishment(companyId),
        onSuccess: (res) => {
            const msg = res?.data?.message || {};
            if (!msg.success) {
                toast.error(msg.error?.message || "Failed");
                return;
            }
            toast.success("Unarchived");
            refetch();
            queryClient.invalidateQueries({ queryKey: ["establishments"] });
        },
        onError: (err) => toast.error(err?.message || "Failed"),
    });

    const deleteMutation = useMutation({
        mutationFn: () => establishmentService.deleteEstablishment(companyId),
        onSuccess: (res) => {
            const msg = res?.data?.message || {};
            if (!msg.success) {
                toast.error(msg.error?.message || "Delete failed — archive instead if linked data exists");
                return;
            }
            toast.success("Deleted");
            setDeleteOpen(false);
            queryClient.invalidateQueries({ queryKey: ["establishments"] });
            navigate("/cheese/establishments");
        },
        onError: (err) => toast.error(err?.message || "Failed"),
    });

    if (!companyId) {
        return null;
    }

    if (error) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <p className="text-muted-foreground mb-4">{error.message}</p>
                <Button variant="outline" onClick={() => refetch()}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Retry
                </Button>
            </div>
        );
    }

    const bankAccounts = payload?.bank_account || [];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate("/cheese/establishments")}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Building2 className="w-7 h-7 text-cheese-600" />
                            {isLoading ? <Skeleton className="h-8 w-48" /> : payload?.company_name}
                        </h1>
                        <p className="text-xs font-mono text-muted-foreground">{companyId}</p>
                    </div>
                    {!isLoading && (
                        <Badge
                            className={
                                payload?.status === "ARCHIVED"
                                    ? "bg-gray-500/15"
                                    : "bg-emerald-500/15 text-emerald-700"
                            }
                        >
                            {payload?.status || "ACTIVE"}
                        </Badge>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                    </Button>
                    {!editMode ? (
                        <Button size="sm" onClick={() => setEditMode(true)}>
                            Edit
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                                Save
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {isLoading ? (
                <Skeleton className="h-40 w-full" />
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Company name</Label>
                                {editMode ? (
                                    <Input
                                        value={form.company_name}
                                        onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                                    />
                                ) : (
                                    <p className="text-sm">{payload?.company_name}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                {editMode ? (
                                    <Input
                                        value={form.email}
                                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                    />
                                ) : (
                                    <p className="text-sm">{payload?.email || "—"}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Phone</Label>
                                {editMode ? (
                                    <Input
                                        value={form.phone_no}
                                        onChange={(e) => setForm((f) => ({ ...f, phone_no: e.target.value }))}
                                    />
                                ) : (
                                    <p className="text-sm">{payload?.phone || "—"}</p>
                                )}
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Website</Label>
                                {editMode ? (
                                    <Input
                                        value={form.website}
                                        onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                                    />
                                ) : (
                                    <p className="text-sm">{payload?.website || "—"}</p>
                                )}
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Description</Label>
                                {editMode ? (
                                    <Input
                                        value={form.company_description}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, company_description: e.target.value }))
                                        }
                                    />
                                ) : (
                                    <p className="text-sm text-muted-foreground">{payload?.description || "—"}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Landmark className="w-4 h-4" /> Bank accounts
                            </CardTitle>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    navigate(`/cheese/bank-accounts/new?company=${encodeURIComponent(companyId)}`)
                                }
                            >
                                <Plus className="w-4 h-4 mr-1" /> Add
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {bankAccounts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No active bank accounts.</p>
                            ) : (
                                bankAccounts.map((ba) => (
                                    <div
                                        key={ba.bank_account_id}
                                        className="flex flex-wrap justify-between gap-2 border border-border rounded-lg p-3 text-sm"
                                    >
                                        <div>
                                            <p className="font-medium">{ba.bank_name}</p>
                                            <p className="font-mono text-xs text-muted-foreground">
                                                {ba.account_number}
                                            </p>
                                        </div>
                                        <Badge variant="outline">{ba.currency}</Badge>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Experiences</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {(payload?.experiences || []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">None linked.</p>
                            ) : (
                                (payload.experiences || []).map((ex) => (
                                    <button
                                        key={ex.name}
                                        type="button"
                                        className="block w-full text-left text-sm py-2 px-3 rounded-md hover:bg-muted"
                                        onClick={() => navigate(`/cheese/experiences/${encodeURIComponent(ex.name)}`)}
                                    >
                                        {ex.experience_name || ex.name}
                                    </button>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                        {payload?.status === "ARCHIVED" ? (
                            <Button
                                variant="outline"
                                onClick={() => unarchiveMutation.mutate()}
                                disabled={unarchiveMutation.isPending}
                            >
                                <ArchiveRestore className="w-4 h-4 mr-2" /> Unarchive
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={() => archiveMutation.mutate()}
                                disabled={archiveMutation.isPending}
                            >
                                <Archive className="w-4 h-4 mr-2" /> Archive
                            </Button>
                        )}
                        <Button variant="destructive" type="button" onClick={() => setDeleteOpen(true)}>
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </Button>
                        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Delete establishment?</DialogTitle>
                                    <DialogDescription>
                                        Only allowed when there are no linked experiences, tickets, or bank accounts.
                                        Otherwise use Archive.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter className="gap-2 sm:gap-0">
                                    <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button variant="destructive" onClick={() => deleteMutation.mutate()}>
                                        Delete
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </>
            )}
        </motion.div>
    );
}

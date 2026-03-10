import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Edit2, Save, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function DetailPageLayout({
    title,
    subtitle,
    backPath,
    isLoading,
    onSave,
    isSaving,
    onEditToggle,
    editMode,
    children,
    statusBadge
}) {
    const navigate = useNavigate();

    return (
        <div className="flex-1 space-y-6 max-w-7xl mx-auto w-full pb-10">
            {/* Header / Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(backPath)} className="mr-2 hidden sm:flex">
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            {isLoading ? (
                                <Skeleton className="h-7 w-48" />
                            ) : (
                                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                            )}
                            {statusBadge && <div className="mt-1">{statusBadge}</div>}
                        </div>
                        {isLoading ? (
                            <Skeleton className="h-4 w-32 mt-2" />
                        ) : (
                            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                    {editMode ? (
                        <>
                            <Button variant="ghost" onClick={onEditToggle} disabled={isSaving}>
                                <X className="w-4 h-4 mr-2" /> Cancel
                            </Button>
                            <Button onClick={onSave} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                {isSaving ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Changes</>}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" onClick={onEditToggle}>
                            <Edit2 className="w-4 h-4 mr-2" /> Edit Record
                        </Button>
                    )}
                </div>
            </div>

            {/* Editable Mode Floating Banner */}
            {editMode && (
                <div className="sticky top-4 z-50 bg-primary/10 border border-primary text-primary px-4 py-2 rounded-lg flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4">
                    <span className="text-sm font-medium">You are in edit mode. Make sure to save your changes.</span>
                    <Button size="sm" onClick={onSave} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save Now"}
                    </Button>
                </div>
            )}

            {/* Main Content Area */}
            {isLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="p-6"><Skeleton className="h-[300px] w-full" /></Card>
                    </div>
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="p-6"><Skeleton className="h-[200px] w-full" /></Card>
                    </div>
                </div>
            ) : (
                <div className="animate-in fade-in duration-500">
                    {children}
                </div>
            )}
        </div>
    );
}

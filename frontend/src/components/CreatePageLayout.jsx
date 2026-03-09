import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";

/**
 * CreatePageLayout — Full-page form wrapper with back arrow, title, and card container.
 *
 * Props:
 *   title       - Heading text
 *   description - Sub-heading
 *   icon        - Lucide icon component
 *   backPath    - Path the back arrow navigates to
 *   onSubmit    - Form submit handler
 *   isSubmitting - Show spinner on submit button
 *   submitLabel - Text on the submit button
 *   children    - Form fields
 */
export default function CreatePageLayout({
    title,
    description,
    icon: Icon,
    backPath,
    onSubmit,
    isSubmitting = false,
    submitLabel = "Create",
    children,
}) {
    const navigate = useNavigate();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 max-w-2xl mx-auto"
        >
            {/* Back button & breadcrumb */}
            <button
                onClick={() => navigate(backPath)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span>Back</span>
            </button>

            <Card className="border-0 shadow-xl">
                <CardHeader className="pb-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className="w-12 h-12 rounded-xl cheese-gradient flex items-center justify-center shadow-lg shadow-yellow-500/20">
                                <Icon className="w-6 h-6 text-black" />
                            </div>
                        )}
                        <div>
                            <CardTitle className="text-xl font-bold">{title}</CardTitle>
                            {description && <CardDescription className="mt-1">{description}</CardDescription>}
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="pt-6">
                    <form
                        onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
                        className="space-y-6"
                    >
                        {children}

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => navigate(backPath)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="cheese-gradient text-black font-semibold border-0 min-w-[120px]"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                                ) : (
                                    submitLabel
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    );
}

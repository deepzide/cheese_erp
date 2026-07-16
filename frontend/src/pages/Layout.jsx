import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import {
    LayoutDashboard, Ticket, Route, Sparkles, CalendarDays,
    Users, UserPlus, FileText, Wallet, ShoppingCart,
    Bell, Menu, LogOut, ChevronDown, ChevronRight, X,
    Zap, Settings, Sun, Moon, Globe,
    Shield, Landmark, UserCheck, QrCode, Star, Activity, MessageSquare, Building2, ScanLine, Hotel, BedDouble, Database, Webhook, FileSearch, History, Bot
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStoredCredentials } from "@/api/client";
import { queryClient } from "@/lib/queryClient";
import { useTheme } from "@/components/ThemeProvider";
import { useHotelAccess } from "@/lib/useHotelAccess";

const URL_ESTABLISHMENTS = createPageUrl("establishments");
const URL_ESTABLISHMENTS_NEW = createPageUrl("establishments/new");

/** Establishments nav active on list and detail, not on the create page */
function isEstablishmentsNavActive(pathname) {
    if (pathname === URL_ESTABLISHMENTS_NEW) return false;
    if (pathname === URL_ESTABLISHMENTS) return true;
    return pathname.startsWith(`${URL_ESTABLISHMENTS}/`);
}

function isNavItemActive(item, pathname) {
    if (item.url === URL_ESTABLISHMENTS) return isEstablishmentsNavActive(pathname);
    return pathname === item.url;
}

const navigationItems = [
    { titleKey: "nav.dashboard", url: createPageUrl("dashboard"), icon: LayoutDashboard, section: "main" },
    { titleKey: "nav.tickets", url: createPageUrl("tickets"), icon: Ticket, section: "flow" },
    { titleKey: "nav.routes", url: createPageUrl("routes"), icon: Route, section: "flow" },
    { titleKey: "nav.bookings", url: createPageUrl("bookings"), icon: ShoppingCart, section: "flow" },
    { titleKey: "nav.experiences", url: createPageUrl("experiences"), icon: Sparkles, section: "catalog" },
    { titleKey: "nav.establishments", url: URL_ESTABLISHMENTS, icon: Building2, section: "catalog" },
    { titleKey: "nav.calendar", url: createPageUrl("calendar"), icon: CalendarDays, section: "catalog" },
    { titleKey: "nav.bookingPolicy", url: createPageUrl("booking-policy"), icon: Shield, section: "catalog" },
    { titleKey: "nav.hotels", url: createPageUrl("hotels"), icon: Hotel, section: "hotel" },
    { titleKey: "nav.hotelReservations", url: createPageUrl("hotel-reservations"), icon: BedDouble, section: "hotel" },
    { titleKey: "nav.hotelAvailability", url: createPageUrl("hotel-availability"), icon: CalendarDays, section: "hotel" },
    { titleKey: "nav.contacts", url: createPageUrl("contacts"), icon: Users, section: "crm" },
    { titleKey: "nav.leads", url: createPageUrl("leads"), icon: UserPlus, section: "crm" },
    { titleKey: "nav.quotations", url: createPageUrl("quotations"), icon: FileText, section: "crm" },
    { titleKey: "nav.conversations", url: createPageUrl("conversations"), icon: MessageSquare, section: "crm" },
    { titleKey: "nav.deposits", url: createPageUrl("deposits"), icon: Wallet, section: "finance" },
    { titleKey: "nav.bankAccounts", url: createPageUrl("bank-accounts"), icon: Landmark, section: "finance" },
    { titleKey: "nav.support", url: createPageUrl("support"), icon: Shield, section: "operations" },
    { titleKey: "nav.attendance", url: createPageUrl("attendance"), icon: UserCheck, section: "operations" },
    { titleKey: "nav.qrTokens", url: createPageUrl("qr-tokens"), icon: QrCode, section: "operations" },
    { titleKey: "nav.qrScan", url: createPageUrl("scan"), icon: ScanLine, section: "operations" },
    { titleKey: "nav.documents", url: createPageUrl("documents"), icon: FileText, section: "operations" },
    { titleKey: "nav.surveys", url: createPageUrl("surveys"), icon: Star, section: "operations" },
    { titleKey: "nav.users", url: createPageUrl("users"), icon: Users, section: "system" },
    { titleKey: "nav.botUsers", url: createPageUrl("bot-users"), icon: Bot, section: "system" },
    { titleKey: "nav.backups", url: createPageUrl("backups"), icon: Database, section: "system" },
    { titleKey: "nav.webhookSettings", url: createPageUrl("webhook-settings"), icon: Webhook, section: "system" },
    { titleKey: "nav.semanticSearch", url: createPageUrl("semantic-search"), icon: FileSearch, section: "system" },
    { titleKey: "nav.searchHistory", url: createPageUrl("search-history"), icon: History, section: "system" },
    { titleKey: "nav.systemEvents", url: createPageUrl("events"), icon: Activity, section: "system" },
];

const sectionDefs = {
    main: { labelKey: "sections.commandCenter", icon: Zap },
    flow: { labelKey: "sections.flowControl", icon: Route },
    catalog: { labelKey: "sections.catalog", icon: Sparkles },
    hotel: { labelKey: "sections.hotel", icon: Hotel },
    crm: { labelKey: "sections.crm", icon: Users },
    finance: { labelKey: "sections.finance", icon: Wallet },
    operations: { labelKey: "sections.operations", icon: Shield },
    system: { labelKey: "sections.system", icon: Activity },
};

export default function Layout({ children }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState({});
    const { theme, setTheme, resolvedTheme } = useTheme();

    const currentUser = getStoredCredentials();
    const user = currentUser || { full_name: "Cheese Admin", role: "admin" };
    const { hasHotelAccess, establishmentName, isLoading: establishmentLoading, isAdmin } = useHotelAccess();

    const visibleNavigationItems = React.useMemo(() => {
        return navigationItems.filter((item) => {
            if (item.section === "hotel") return hasHotelAccess;
            const adminOnlyPages = ["backups", "events", "users", "bot-users", "webhook-settings", "semantic-search", "search-history"];
            if (adminOnlyPages.some((page) => item.url.endsWith(page))) return isAdmin;
            return true;
        });
    }, [hasHotelAccess, isAdmin]);

    const toggleLanguage = () => {
        const next = i18n.language === "es" ? "en" : "es";
        i18n.changeLanguage(next);
    };

    const toggleSection = (key) => {
        setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleTheme = () => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
    };

    const handleLogout = async () => {
        try {
            const { authService } = await import('@/api/authService');
            await authService.logout();
        } catch (err) { }
        queryClient.clear();
        localStorage.clear();
        sessionStorage.clear();
        navigate("/cheese/login");
    };

    const SidebarContent = () => (
        <>
            {/* Logo */}
            <div className="p-5 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 cheese-gradient rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20">
                        <span className="text-xl font-black text-black">🧀</span>
                    </div>
                    <div>
                        <h2 className="font-bold text-cheese-400 text-lg tracking-tight">Cheese</h2>
                        <p className="text-[11px] text-white/40 font-medium">{t("sections.commandCenter")}</p>
                        <p className="text-[11px] text-white/60 mt-1 truncate">
                            {establishmentLoading
                                ? t("common.loading", "Loading...")
                                : establishmentName || t("layout.noEstablishment", "No establishment")}
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <ScrollArea className="flex-1 px-3 py-4">
                {Object.entries(sectionDefs).map(([key, section]) => {
                    const items = visibleNavigationItems.filter(item => item.section === key);
                    if (items.length === 0) return null;
                    const isGroupActive = items.some(item => isNavItemActive(item, location.pathname));
                    const isCollapsed = collapsedSections[key] && !isGroupActive;

                    return (
                        <div key={key} className="mb-3">
                            <button
                                onClick={() => toggleSection(key)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-widest rounded-lg transition-colors ${isGroupActive ? 'text-cheese-400' : 'text-white/30 hover:text-white/50'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    <section.icon className="w-3 h-3" />
                                    {t(section.labelKey)}
                                </span>
                                {isCollapsed ? (
                                    <ChevronRight className="w-3 h-3" />
                                ) : (
                                    <ChevronDown className="w-3 h-3" />
                                )}
                            </button>

                            {!isCollapsed && (
                                <div className="mt-1 space-y-0.5">
                                    {items.map((item) => {
                                        const isActive = isNavItemActive(item, location.pathname);
                                        return (
                                            <a
                                                key={item.titleKey}
                                                href={item.url}
                                                onClick={() => setSidebarOpen(false)}
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                                    ? 'bg-cheese-500 text-black shadow-lg shadow-yellow-500/20'
                                                    : 'text-white/60 hover:text-white hover:bg-white/5'
                                                    }`}
                                            >
                                                <item.icon className={`w-4 h-4 ${isActive ? 'text-black' : ''}`} />
                                                <span>{t(item.titleKey)}</span>
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </ScrollArea>

            {/* User Footer */}
            <div className="border-t border-white/10 p-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 cheese-gradient rounded-full flex items-center justify-center">
                        <span className="text-black font-bold text-sm">{user?.full_name?.charAt(0) || 'C'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-white/90 text-sm truncate">{user?.full_name || 'User'}</p>
                        <p className="text-[11px] text-white/40 truncate">{user?.email || ''}</p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    onClick={handleLogout}
                    className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 justify-start px-3 h-9"
                >
                    <LogOut className="w-4 h-4 mr-2" /> {t("common.logout")}
                </Button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen flex w-full bg-background">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex flex-col w-64 bg-[#0d0d0d] border-r border-white/5 fixed inset-y-0 left-0 z-40">
                <SidebarContent />
            </aside>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="lg:hidden fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
                    <aside className="relative w-72 h-full bg-[#0d0d0d] flex flex-col animate-slide-in-right">
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="absolute top-4 right-4 text-white/40 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <SidebarContent />
                    </aside>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 flex flex-col lg:ml-64 min-h-screen">
                {/* Top Header */}
                <header className="sticky top-0 z-30 glass-surface border-b border-border px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors"
                        >
                            <Menu className="w-5 h-5 text-muted-foreground" />
                        </button>
                        <div className="lg:hidden flex items-center gap-2">
                            <span className="text-xl">🧀</span>
                            <h1 className="text-lg font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
                                Cheese
                            </h1>
                        </div>
                        <Badge variant="outline" className="max-w-[220px] truncate">
                            {isAdmin
                                ? t("layout.allEstablishments", "All Establishments")
                                : (establishmentName || t("layout.noEstablishment", "No establishment"))}
                        </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Language Toggle */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleLanguage}
                            className="text-muted-foreground hover:text-foreground gap-1.5 font-semibold text-xs px-2"
                            title={i18n.language === "es" ? t("layout.switchToEnglish", "Switch to English") : t("layout.switchToSpanish", "Switch to Spanish")}
                        >
                            <Globe className="w-4 h-4" />
                            <span>{i18n.language === "es" ? "ES" : "EN"}</span>
                        </Button>

                        {/* Theme Toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleTheme}
                            className="text-muted-foreground hover:text-foreground"
                            title={resolvedTheme === "dark" ? t("layout.switchToLight", "Switch to light mode") : t("layout.switchToDark", "Switch to dark mode")}
                        >
                            {resolvedTheme === "dark" ? (
                                <Sun className="w-5 h-5" />
                            ) : (
                                <Moon className="w-5 h-5" />
                            )}
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
                                    <Bell className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-72">
                                <DropdownMenuLabel className="font-bold">{t("common.notifications")}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <div className="p-4 text-center text-sm text-muted-foreground">
                                    {t("common.noNotifications")}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}

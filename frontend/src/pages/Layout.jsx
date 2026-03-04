import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
    LayoutDashboard, Ticket, Route, Sparkles, CalendarDays,
    Users, UserPlus, FileText, Wallet, ShoppingCart,
    Bell, Menu, LogOut, ChevronDown, ChevronRight, X,
    Zap, Settings
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStoredCredentials } from "@/api/client";

const navigationItems = [
    { title: "Dashboard", url: createPageUrl("dashboard"), icon: LayoutDashboard, section: "main" },
    { title: "Tickets", url: createPageUrl("tickets"), icon: Ticket, section: "flow" },
    { title: "Routes", url: createPageUrl("routes"), icon: Route, section: "flow" },
    { title: "Bookings", url: createPageUrl("bookings"), icon: ShoppingCart, section: "flow" },
    { title: "Experiences", url: createPageUrl("experiences"), icon: Sparkles, section: "catalog" },
    { title: "Calendar", url: createPageUrl("calendar"), icon: CalendarDays, section: "catalog" },
    { title: "Contacts", url: createPageUrl("contacts"), icon: Users, section: "crm" },
    { title: "Leads", url: createPageUrl("leads"), icon: UserPlus, section: "crm" },
    { title: "Quotations", url: createPageUrl("quotations"), icon: FileText, section: "crm" },
    { title: "Deposits", url: createPageUrl("deposits"), icon: Wallet, section: "finance" },
];

const sections = {
    main: { label: "Command Center", icon: Zap },
    flow: { label: "Flow Control", icon: Route },
    catalog: { label: "Catalog", icon: Sparkles },
    crm: { label: "CRM", icon: Users },
    finance: { label: "Finance", icon: Wallet },
};

export default function Layout({ children }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState({});

    const currentUser = getStoredCredentials();
    const user = currentUser || { full_name: "Cheese Admin", role: "admin" };

    const toggleSection = (key) => {
        setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleLogout = async () => {
        try {
            const { authService } = await import('@/api/authService');
            await authService.logout();
        } catch (err) { }
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
                        <p className="text-[11px] text-white/40 font-medium">Control Center</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <ScrollArea className="flex-1 px-3 py-4">
                {Object.entries(sections).map(([key, section]) => {
                    const items = navigationItems.filter(item => item.section === key);
                    if (items.length === 0) return null;
                    const isGroupActive = items.some(item => location.pathname === item.url);
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
                                    {section.label}
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
                                        const isActive = location.pathname === item.url;
                                        return (
                                            <Link
                                                key={item.title}
                                                to={item.url}
                                                onClick={() => setSidebarOpen(false)}
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                                        ? 'bg-cheese-500 text-black shadow-lg shadow-yellow-500/20'
                                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                                    }`}
                                            >
                                                <item.icon className={`w-4 h-4 ${isActive ? 'text-black' : ''}`} />
                                                <span>{item.title}</span>
                                            </Link>
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
                    <LogOut className="w-4 h-4 mr-2" /> Logout
                </Button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen flex w-full bg-gradient-to-br from-amber-50/30 via-white to-yellow-50/20">
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
                <header className="sticky top-0 z-30 glass-light border-b border-gray-200/60 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <Menu className="w-5 h-5 text-gray-600" />
                        </button>
                        <div className="lg:hidden flex items-center gap-2">
                            <span className="text-xl">🧀</span>
                            <h1 className="text-lg font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
                                Cheese
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="relative text-gray-500 hover:text-gray-700">
                                    <Bell className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-72">
                                <DropdownMenuLabel className="font-bold">Notifications</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <div className="p-4 text-center text-sm text-muted-foreground">
                                    No new notifications
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

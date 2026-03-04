import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import AuthGuard from '@/components/auth/AuthGuard';
import Login from './Login';
import Layout from './Layout';
import Dashboard from './Dashboard';
import Tickets from './Tickets';
import RoutesPage from './Routes';
import Experiences from './Experiences';
import Calendar from './Calendar';
import Contacts from './Contacts';
import Leads from './Leads';
import Quotations from './Quotations';
import Deposits from './Deposits';
import Bookings from './Bookings';

export default function Pages() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/cheese/login" element={<Login />} />
                <Route
                    path="/cheese/*"
                    element={
                        <AuthGuard>
                            <Layout>
                                <AnimatePresence mode="wait">
                                    <Routes>
                                        <Route path="/dashboard" element={<Dashboard />} />
                                        <Route path="/tickets" element={<Tickets />} />
                                        <Route path="/routes" element={<RoutesPage />} />
                                        <Route path="/experiences" element={<Experiences />} />
                                        <Route path="/calendar" element={<Calendar />} />
                                        <Route path="/contacts" element={<Contacts />} />
                                        <Route path="/leads" element={<Leads />} />
                                        <Route path="/quotations" element={<Quotations />} />
                                        <Route path="/deposits" element={<Deposits />} />
                                        <Route path="/bookings" element={<Bookings />} />
                                        <Route path="/" element={<Navigate to="/cheese/dashboard" replace />} />
                                        <Route path="*" element={<Navigate to="/cheese/dashboard" replace />} />
                                    </Routes>
                                </AnimatePresence>
                            </Layout>
                        </AuthGuard>
                    }
                />
                <Route path="*" element={<Navigate to="/cheese/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

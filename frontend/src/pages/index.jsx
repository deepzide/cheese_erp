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
import Support from './Support';
import BookingPolicy from './BookingPolicy';
import BankAccounts from './BankAccounts';
import Attendance from './Attendance';
import Documents from './Documents';
import QRTokens from './QRTokens';
import SurveyResponses from './SurveyResponses';
import SystemEvents from './SystemEvents';
import Conversations from './Conversations';
import ContactCreate from './ContactCreate';
import LeadCreate from './LeadCreate';
import QuotationCreate from './QuotationCreate';
import SupportCreate from './SupportCreate';
import BookingPolicyCreate from './BookingPolicyCreate';
import BankAccountCreate from './BankAccountCreate';
import DocumentCreate from './DocumentCreate';
import TicketCreate from './TicketCreate';

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
                                        <Route path="/tickets/new" element={<TicketCreate />} />
                                        <Route path="/routes" element={<RoutesPage />} />
                                        <Route path="/experiences" element={<Experiences />} />
                                        <Route path="/calendar" element={<Calendar />} />
                                        <Route path="/contacts" element={<Contacts />} />
                                        <Route path="/contacts/new" element={<ContactCreate />} />
                                        <Route path="/leads" element={<Leads />} />
                                        <Route path="/leads/new" element={<LeadCreate />} />
                                        <Route path="/quotations" element={<Quotations />} />
                                        <Route path="/quotations/new" element={<QuotationCreate />} />
                                        <Route path="/deposits" element={<Deposits />} />
                                        <Route path="/bookings" element={<Bookings />} />
                                        <Route path="/support" element={<Support />} />
                                        <Route path="/support/new" element={<SupportCreate />} />
                                        <Route path="/booking-policy" element={<BookingPolicy />} />
                                        <Route path="/booking-policy/new" element={<BookingPolicyCreate />} />
                                        <Route path="/bank-accounts" element={<BankAccounts />} />
                                        <Route path="/bank-accounts/new" element={<BankAccountCreate />} />
                                        <Route path="/attendance" element={<Attendance />} />
                                        <Route path="/documents" element={<Documents />} />
                                        <Route path="/documents/new" element={<DocumentCreate />} />
                                        <Route path="/qr-tokens" element={<QRTokens />} />
                                        <Route path="/surveys" element={<SurveyResponses />} />
                                        <Route path="/events" element={<SystemEvents />} />
                                        <Route path="/conversations" element={<Conversations />} />
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

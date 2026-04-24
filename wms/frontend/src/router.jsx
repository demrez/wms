import { Navigate, createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Warehouse from './pages/Warehouse';
import NewOrder from './pages/NewOrder';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Documents from './pages/Documents';
import AdminCatalogs from './pages/AdminCatalogs';
import Supplies from './pages/Supplies';
import Services from './pages/Services';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Proposals from './pages/Proposals';
import Marketplace from './pages/Marketplace';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';
import HonestSign from './pages/HonestSign';
import ClientLayout from './components/ClientLayout';
import ClientLogin from './pages/client/ClientLogin';
import ClientDashboard from './pages/client/ClientDashboard';
import ClientOrders from './pages/client/ClientOrders';
import ClientOrderDetail from './pages/client/ClientOrderDetail';
import ClientProducts from './pages/client/ClientProducts';
import ClientInvoices from './pages/client/ClientInvoices';
import ClientNotifications from './pages/client/ClientNotifications';
import ClientNewOrder from './pages/client/ClientNewOrder';
import ClientIntegrations from './pages/client/ClientIntegrations';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/client/login', element: <ClientLogin /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true,              element: <Dashboard /> },
      { path: 'orders',           element: <Orders /> },
      { path: 'orders/:id',       element: <OrderDetail /> },
      { path: 'products',         element: <Products /> },
      { path: 'products/:id',     element: <ProductDetail /> },
      { path: 'warehouse',        element: <Warehouse /> },
      { path: 'admin',            element: <AdminCatalogs /> },
      { path: 'supplies',         element: <Supplies /> },
      { path: 'services',         element: <Services /> },
      { path: 'invoices',         element: <Invoices /> },
      { path: 'invoices/:id',     element: <InvoiceDetail /> },
      { path: 'kp',               element: <Proposals /> },
      { path: 'proposals',        element: <Navigate to="/kp" replace /> },
      { path: 'marketplace',      element: <Marketplace /> },
      { path: 'honest-sign',      element: <HonestSign /> },
      { path: 'settings',         element: <Settings /> },
      { path: 'onboarding',       element: <Onboarding /> },
      { path: 'documents',        element: <Documents /> },
      { path: 'new-order',        element: <NewOrder /> },
      { path: 'companies',        element: <Companies /> },
      { path: 'companies/:id',    element: <CompanyDetail /> },
    ],
  },
  {
    path: '/client',
    element: <ClientLayout />,
    children: [
      { index: true, element: <ClientDashboard /> },
      { path: 'orders', element: <ClientOrders /> },
      { path: 'orders/:id', element: <ClientOrderDetail /> },
      { path: 'products', element: <ClientProducts /> },
      { path: 'documents', element: <ClientInvoices /> },
      { path: 'invoices', element: <Navigate to="/client/documents" replace /> },
      { path: 'integrations', element: <ClientIntegrations /> },
      { path: 'notifications', element: <ClientNotifications /> },
      { path: 'new-order', element: <ClientNewOrder /> },
    ],
  },
]);

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

// ─── AUTH ───────────────────────────────────────────────
export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: () => api.get('/auth/me').then(r => r.data) });

export const useSettingsProfile = () =>
  useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: () => api.get('/settings/profile').then((r) => r.data),
  });

export const useUpdateSettingsProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.patch('/settings/profile', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'profile'] }),
  });
};

// ─── COMPANIES ──────────────────────────────────────────
export const useCompanies = () =>
  useQuery({ queryKey: ['companies'], queryFn: () => api.get('/companies').then(r => r.data) });

export const useCompany = (id) =>
  useQuery({ queryKey: ['companies', id], queryFn: () => api.get(`/companies/${id}`).then(r => r.data), enabled: !!id });

export const useCreateCompany = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: data => api.post('/companies', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });
};

export const useUpdateCompany = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/companies/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      if (vars?.id) qc.invalidateQueries({ queryKey: ['companies', vars.id] });
    },
  });
};

export const useDeleteCompany = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/companies/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['warehouse'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
};

export const useImportCompanyProducts = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }) => {
      const formData = new FormData();
      formData.append('file', file, file.name);
      return api.post(`/companies/${id}/products/import`, formData).then((r) => r.data);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['companies', vars.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['warehouse'] });
    },
  });
};

// ─── PRODUCTS ───────────────────────────────────────────
export const useProducts = (params = {}) => {
  const { enabled = true, ...queryParams } = params;
  return useQuery({
    queryKey: ['products', queryParams],
    queryFn: () => api.get('/products', { params: queryParams }).then(r => r.data),
    enabled,
  });
};

export const useProduct = (id) =>
  useQuery({ queryKey: ['products', id], queryFn: () => api.get(`/products/${id}`).then(r => r.data), enabled: !!id });

export const useCreateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: data => api.post('/products', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
};

export const useUpdateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/products/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products', vars.id] });
    },
  });
};

export const useDeleteProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: id => api.delete(`/products/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['warehouse'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
};

export const useUpdateBarcodes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, barcodes }) => api.put(`/products/${id}/barcodes`, barcodes).then(r => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['products', vars.id] }),
  });
};

export const useDeleteClientProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/client/products/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['client', 'summary'] });
    },
  });
};

// ─── ORDERS ─────────────────────────────────────────────
export const useOrders = (params = {}) =>
  useQuery({
    queryKey: ['orders', params],
    queryFn: () => api.get('/orders', { params }).then(r => r.data),
  });

export const useKanban = () =>
  useQuery({
    queryKey: ['orders', 'kanban'],
    queryFn: () => api.get('/orders/kanban').then(r => r.data),
    refetchInterval: 30000,
  });

export const useOrder = (id) =>
  useQuery({ queryKey: ['orders', id], queryFn: () => api.get(`/orders/${id}`).then(r => r.data), enabled: !!id });

export const useOrderBoxes = (orderId) =>
  useQuery({
    queryKey: ['orders', orderId, 'boxes'],
    queryFn: () => api.get(`/orders/${orderId}/boxes`).then((r) => r.data),
    enabled: !!orderId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

export const useClientOrderDocuments = (orderId) =>
  useQuery({
    queryKey: ['client', 'order-documents', orderId],
    queryFn: () => api.get(`/client/orders/${orderId}/documents`).then((r) => r.data),
    enabled: !!orderId,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

export const useUpdateClientOrderItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, itemId, ...data }) =>
      api.patch(`/client/orders/${orderId}/items/${itemId}`, data).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['client', 'summary'] });
      qc.invalidateQueries({ queryKey: ['client', 'order-documents', vars.orderId] });
    },
  });
};

export const useCreateOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: data => api.post('/orders', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['orders', 'kanban'] });
    },
  });
};

export const useImportOrderItemsXlsx = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, company_id }) => {
      const formData = new FormData();
      formData.append('file', file, file.name);
      if (company_id) formData.append('company_id', company_id);
      return api.post('/orders/import-items-xlsx', formData).then((r) => r.data);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      if (vars?.company_id) {
        qc.invalidateQueries({ queryKey: ['companies', vars.company_id] });
      }
      qc.invalidateQueries({ queryKey: ['client-summary'] });
    },
  });
};

export const useDeleteClientOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/client/orders/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['orders', 'kanban'] });
      qc.invalidateQueries({ queryKey: ['client', 'summary'] });
      qc.invalidateQueries({ queryKey: ['client-documents-index'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['client-unread'] });
    },
  });
};

export const useLogisticsReference = () =>
  useQuery({
    queryKey: ['logistics', 'reference'],
    queryFn: () => api.get('/logistics/reference').then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60000,
  });

export const useLogisticsWarehouses = () =>
  useQuery({
    queryKey: ['logistics', 'warehouses'],
    queryFn: () => api.get('/logistics/warehouses').then((r) => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60000,
  });

export const useCreateLogisticsWarehouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/logistics/warehouses', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logistics', 'warehouses'] });
      qc.invalidateQueries({ queryKey: ['logistics', 'reference'] });
    },
  });
};

export const useUpdateLogisticsWarehouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/logistics/warehouses/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logistics', 'warehouses'] });
      qc.invalidateQueries({ queryKey: ['logistics', 'reference'] });
    },
  });
};

export const useDeleteLogisticsWarehouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/logistics/warehouses/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logistics', 'warehouses'] });
      qc.invalidateQueries({ queryKey: ['logistics', 'reference'] });
    },
  });
};

export const useOrderCharges = (orderId) =>
  useQuery({
    queryKey: ['billing', 'order-charges', orderId],
    queryFn: () => api.get(`/billing/orders/${orderId}/charges`).then(r => r.data),
    enabled: !!orderId,
  });

export const useTariffs = () =>
  useQuery({
    queryKey: ['billing', 'tariffs'],
    queryFn: () => api.get('/billing/tariffs').then(r => r.data),
    staleTime: 300000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60000,
  });

export const useCreateTariff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/billing/tariffs', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'tariffs'] });
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
};

export const useUpdateTariff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, ...data }) => api.patch(`/billing/tariffs/${code}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'tariffs'] });
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
};

export const useDeleteTariff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code) => api.delete(`/billing/tariffs/${code}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'tariffs'] });
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
};

export const useConsumables = () =>
  useQuery({
    queryKey: ['admin', 'consumables'],
    queryFn: () => api.get('/admin/consumables').then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60000,
  });

export const useCreateConsumable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/admin/consumables', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'consumables'] });
      qc.invalidateQueries({ queryKey: ['supplies'] });
    },
  });
};

export const useUpdateConsumable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/admin/consumables/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'consumables'] });
      qc.invalidateQueries({ queryKey: ['supplies'] });
    },
  });
};

export const useDeleteConsumable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/admin/consumables/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'consumables'] });
      qc.invalidateQueries({ queryKey: ['supplies'] });
    },
  });
};

// ─── SUPPLIES / MATERIALS ─────────────────────────────────────
export const useSupplies = () =>
  useQuery({
    queryKey: ['supplies'],
    queryFn: () => api.get('/supplies').then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60000,
  });

export const useLowStock = () =>
  useQuery({ queryKey: ['supplies', 'low-stock'], queryFn: () => api.get('/supplies/low-stock').then(r => r.data) });

export const useSupplyOp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.post(`/supplies/${id}/ops`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplies'] }),
  });
};

// ─── SERVICES CATALOG / ORDER SERVICES ────────────────────────
export const useServices = () =>
  useQuery({
    queryKey: ['services'],
    queryFn: () => api.get('/services').then(r => r.data),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60000,
  });

export const useOrderServices = (orderId) =>
  useQuery({
    queryKey: ['order-services', orderId],
    queryFn: () => api.get(`/services/order/${orderId}`).then(r => r.data),
    enabled: !!orderId,
  });

export const useAddOrderService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...data }) => api.post(`/services/order/${orderId}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['order-services', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['supplies'] });
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['billing', 'documents'] });
    },
  });
};

export const useRemoveOrderService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, entryId }) => api.delete(`/services/order/${orderId}/${entryId}`).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['order-services', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['supplies'] });
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['billing', 'documents'] });
    },
  });
};

export const useDeleteCharge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.delete(`/billing/charges/${id}`).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['billing', 'documents'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['billing', 'order-charges', vars?.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['client-documents-index'] });
      qc.invalidateQueries({ queryKey: ['client', 'order-documents', vars?.orderId] });
      qc.invalidateQueries({ queryKey: ['client-summary'] });
    },
  });
};

export const useCreateService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: data => api.post('/services', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['billing', 'tariffs'] });
    },
  });
};

export const useImportServices = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/services/import', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['billing', 'tariffs'] });
    },
  });
};

export const useUpdateService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/services/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['billing', 'tariffs'] });
    },
  });
};

export const useUpdateServiceConsumables = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, consumables }) => api.put(`/services/${id}/consumables`, consumables).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['billing', 'tariffs'] });
    },
  });
};

// ─── INVOICES / PROPOSALS ─────────────────────────────────────
export const useInvoices = (params = {}) =>
  useQuery({ queryKey: ['invoices', params], queryFn: () => api.get('/invoices', { params }).then(r => r.data) });

export const useInvoice = (id) =>
  useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/invoices/${id}`).then((r) => r.data),
    enabled: !!id,
  });

export const useGenerateInvoice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: data => api.post('/invoices/generate', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
};

export const useUpdateInvoice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/invoices/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', vars.id] });
    },
  });
};

export const useUpdateInvoiceItems = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }) => api.put(`/invoices/${id}/items`, items).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', vars.id] });
    },
  });
};

export const useProposals = () =>
  useQuery({ queryKey: ['proposals'], queryFn: () => api.get('/invoices/proposals/list').then(r => r.data) });

export const useProposal = (id) =>
  useQuery({ queryKey: ['proposals', id], queryFn: () => api.get(`/invoices/proposals/${id}`).then(r => r.data), enabled: !!id });

export const useCreateProposal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: data => api.post('/invoices/proposals', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proposals'] }),
  });
};

export const useUpdateProposal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/invoices/proposals/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['proposals', vars.id] });
    },
  });
};

export const useBillingDocuments = (params = {}) =>
  useQuery({
    queryKey: ['billing', 'documents', params],
    queryFn: () => api.get('/billing/documents', { params }).then(r => r.data),
  });

export const useCreateCharge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/billing/charges', data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['billing', 'order-charges', vars.order_id] });
      qc.invalidateQueries({ queryKey: ['billing', 'documents'] });
      qc.invalidateQueries({ queryKey: ['orders', vars.order_id] });
    },
  });
};

export const useUpdateCharge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/billing/charges/${id}`, data).then(r => r.data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['billing', 'order-charges', result.order_id] });
      qc.invalidateQueries({ queryKey: ['billing', 'documents'] });
      qc.invalidateQueries({ queryKey: ['orders', result.order_id] });
    },
  });
};

export const useMoveStage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage, note }) => api.patch(`/orders/${id}/stage`, { stage, note }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['orders', 'kanban'] });
      qc.invalidateQueries({ queryKey: ['orders', vars.id] });
      qc.invalidateQueries({ queryKey: ['client-summary'] });
      qc.invalidateQueries({ queryKey: ['client-documents-index'] });
      qc.invalidateQueries({ queryKey: ['client', 'order-documents', vars.id] });
    },
  });
};

export const useUpdateOrderItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, itemId, ...data }) =>
      api.patch(`/orders/${orderId}/items/${itemId}`, data).then(r => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['orders', vars.orderId] }),
  });
};

export const useImportOrderHonestCodes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, itemId, ...data }) =>
      api.post(`/orders/${orderId}/items/${itemId}/honest-codes/import`, data).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useImportOrderHonestCodesFile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, file, replace = false }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('replace', replace ? 'true' : 'false');
      const { data } = await api.post(`/orders/${orderId}/honest-codes/import-file`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useScanOrderHonestCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, code }) =>
      api.post(`/orders/${orderId}/honest-codes/scan`, { code }).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useDownloadOrderHonestMismatchReport = () => {
  return useMutation({
    mutationFn: async ({ orderId }) => {
      const response = await api.get(`/orders/${orderId}/honest-codes/mismatch-report`, {
        responseType: 'blob',
      });
      return {
        blob: response.data,
        filename: response.headers?.['content-disposition'] || '',
      };
    },
  });
};

export const useAddOrderItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...data }) => api.post(`/orders/${orderId}/items`, data).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useUpdateOrderDetails = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...data }) => api.patch(`/orders/${orderId}/details`, data).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useUpdateOrderShipments = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, shipments }) => api.put(`/orders/${orderId}/shipments`, shipments).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId, 'boxes'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['orders', 'kanban'] });
    },
  });
};

export const useGenerateOrderBoxes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId }) => api.post(`/orders/${orderId}/boxes/generate`).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId, 'boxes'] });
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useSaveOrderBoxes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, boxes }) => api.put(`/orders/${orderId}/boxes`, { boxes }).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId, 'boxes'] });
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useCompleteOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: id => api.post(`/orders/${id}/complete`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['orders', 'kanban'] });
      qc.invalidateQueries({ queryKey: ['warehouse'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['client-summary'] });
      qc.invalidateQueries({ queryKey: ['client-documents-index'] });
    },
  });
};

export const useIssueInvoiceFromOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ order_id, type = 'invoice', tax_rate = 0, notes }) =>
      api.post('/invoices/from-order', { order_id, type, tax_rate, notes }).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['client-summary'] });
      qc.invalidateQueries({ queryKey: ['client-unread'] });
      qc.invalidateQueries({ queryKey: ['client-documents-index'] });
      if (vars?.order_id) {
        qc.invalidateQueries({ queryKey: ['client', 'order-documents', vars.order_id] });
        qc.invalidateQueries({ queryKey: ['orders', vars.order_id] });
      }
    },
  });
};

export const useAddOrderConsumable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...data }) => api.post(`/orders/${orderId}/consumables`, data).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['admin', 'consumables'] });
    },
  });
};

export const useUpdateOrderConsumable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, entryId, ...data }) =>
      api.patch(`/orders/${orderId}/consumables/${entryId}`, data).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['admin', 'consumables'] });
    },
  });
};

export const useRemoveOrderConsumable = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, entryId }) => api.delete(`/orders/${orderId}/consumables/${entryId}`).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['orders', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['admin', 'consumables'] });
    },
  });
};

// ─── WAREHOUSE ──────────────────────────────────────────
export const useWarehouseSummary = () =>
  useQuery({ queryKey: ['warehouse', 'summary'], queryFn: () => api.get('/warehouse/summary').then(r => r.data) });

export const useWarehouseOps = (params = {}) =>
  useQuery({
    queryKey: ['warehouse', 'ops', params],
    queryFn: () => api.get('/warehouse/ops', { params }).then(r => r.data),
  });

export const useDefects = () =>
  useQuery({ queryKey: ['warehouse', 'defects'], queryFn: () => api.get('/warehouse/defects').then(r => r.data) });

export const useWarehouseOp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: data => api.post('/warehouse/ops', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
};

export const useTogglePaidStorage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, paid_storage }) =>
      api.patch(`/warehouse/paid-storage/${productId}`, { paid_storage }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
};

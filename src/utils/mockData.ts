// Mock data for development and testing purposes

export const mockUsers = [
  { id: '1', name: 'John Doe', email: 'john@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
];

export const mockSalesData = {
  dailySales: 8,
  monthlySales: 187,
  callsMade: 72,
  contactsArgued: 30,
  objectives: {
    sales: { target: 250, current: 187 },
    calls: { target: 1000, current: 728 },
  },
  conversionRate: 42, // percentage
  averageCallTime: '5:23', // minutes:seconds
};

export const mockSalesHistory = [
  { date: '2023-04-01', sales: 8, calls: 35 },
  { date: '2023-04-02', sales: 12, calls: 40 },
  { date: '2023-04-03', sales: 10, calls: 38 },
  { date: '2023-04-04', sales: 15, calls: 45 },
  { date: '2023-04-05', sales: 9, calls: 32 },
  // Add more historical data as needed
];

export const mockTeamPerformance = [
  { name: 'Alice', sales: 42, calls: 210, conversionRate: 20 },
  { name: 'Bob', sales: 38, calls: 185, conversionRate: 21 },
  { name: 'Charlie', sales: 51, calls: 230, conversionRate: 22 },
  { name: 'Diana', sales: 45, calls: 200, conversionRate: 23 },
];

export const mockOfferDistribution = [
  { name: 'Offre Standard', percentage: 40 },
  { name: 'Offre Premium', percentage: 25 },
  { name: 'Offre Enterprise', percentage: 20 },
  { name: 'Services Additionnels', percentage: 15 },
];

export const mockRecentSales = [
  { 
    id: '1', 
    date: '2023-04-05', 
    client: 'Acme Corp', 
    amount: 2500, 
    product: 'Enterprise Plan',
    status: 'completed'
  },
  { 
    id: '2', 
    date: '2023-04-04', 
    client: 'Globex Inc', 
    amount: 1200, 
    product: 'Premium Plan',
    status: 'pending'
  },
  { 
    id: '3', 
    date: '2023-04-04', 
    client: 'Initech', 
    amount: 800, 
    product: 'Standard Plan',
    status: 'completed'
  },
  { 
    id: '4', 
    date: '2023-04-03', 
    client: 'Umbrella Corp', 
    amount: 3000, 
    product: 'Enterprise Plan',
    status: 'completed'
  },
];

export const mockAlerts = [
  {
    id: '1',
    type: 'info',
    message: 'Nouvelle campagne de printemps lancée. Nouveaux scripts disponibles dans la section Resources.',
    date: '2023-04-05'
  },
  {
    id: '2',
    type: 'warning',
    message: 'Objectif de vente mensuel atteint à 75% seulement. Encore 10 jours pour rattraper.',
    date: '2023-04-04'
  },
  {
    id: '3',
    type: 'success',
    message: 'Félicitations à l\'équipe Alpha pour avoir dépassé leur objectif trimestriel!',
    date: '2023-04-03'
  },
];
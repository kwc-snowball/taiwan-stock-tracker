// TWSE API endpoints
const TWSE_API_BASE = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';
const STOCK_LIST_API = 'https://www.twse.com.tw/zh/api/codeTradingStocks';

// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const suggestions = document.getElementById('suggestions');
const infoSection = document.getElementById('infoSection');
const periodSection = document.getElementById('periodSection');
const chartSection = document.getElementById('chartSection');
const errorSection = document.getElementById('errorSection');
const loadingSpinner = document.getElementById('loadingSpinner');

let stockList = [];
let currentStock = null;
let currentChart = null;
let currentPeriod = '1d';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadStockList();
    setupEventListeners();
});

function setupEventListeners() {
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    searchInput.addEventListener('input', handleSearchInput);

    document.addEventListener('click', (e) => {
        if (e.target !== searchInput && e.target !== suggestions) {
            suggestions.classList.remove('active');
        }
    });

    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentPeriod = e.target.dataset.period;
            if (currentStock) {
                loadChartData(currentStock.code);
            }
        });
    });
}

async function loadStockList() {
    try {
        const response = await fetch(STOCK_LIST_API);
        const data = await response.json();
        stockList = data || [];
    } catch (error) {
        console.error('Error loading stock list:', error);
        stockList = [];
    }
}

function handleSearchInput(e) {
    const query = e.target.value.toLowerCase().trim();

    if (query.length === 0) {
        suggestions.classList.remove('active');
        return;
    }

    const filtered = stockList
        .filter(stock => {
            const code = stock.code.toLowerCase();
            const name = (stock.name || '').toLowerCase();
            return code.includes(query) || name.includes(query);
        })
        .slice(0, 8);

    if (filtered.length > 0) {
        suggestions.innerHTML = filtered
            .map(stock => `
                <div class="suggestion-item" onclick="selectStock('${stock.code}', '${stock.name}')">
                    <span class="suggestion-code">${stock.code}</span>
                    <span>${stock.name}</span>
                </div>
            `)
            .join('');
        suggestions.classList.add('active');
    } else {
        suggestions.classList.remove('active');
    }
}

function selectStock(code, name) {
    searchInput.value = `${code} - ${name}`;
    suggestions.classList.remove('active');
    currentStock = { code, name };
    loadStockData(code);
}

async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    const stock = stockList.find(s => 
        s.code.toLowerCase() === query.toLowerCase() ||
        s.name.toLowerCase().includes(query.toLowerCase())
    );

    if (stock) {
        currentStock = stock;
        searchInput.value = `${stock.code} - ${stock.name}`;
        suggestions.classList.remove('active');
        loadStockData(stock.code);
    } else {
        showError('Stock not found. Please try again.');
    }
}

async function loadStockData(code) {
    clearSections();
    showLoading(true);

    try {
        const today = new Date();
        const dateStr = formatDate(today);

        const response = await fetch(
            `${TWSE_API_BASE}?response=json&date=${dateStr}&stockNo=${code}`
        );
        const data = await response.json();

        if (data.stat === 'OK' && data.data && data.data.length > 0) {
            const latestData = data.data[0];
            displayStockInfo(code, currentStock.name, latestData);
            infoSection.style.display = 'block';
            periodSection.style.display = 'block';
            chartSection.style.display = 'block';
            
            // Reset period buttons
            document.querySelectorAll('.period-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.period === '1d');
            });
            currentPeriod = '1d';

            await loadChartData(code);
        } else {
            showError('Stock data not available. Please try another stock.');
        }
    } catch (error) {
        console.error('Error loading stock data:', error);
        showError('Error fetching stock data. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function loadChartData(code) {
    showLoading(true);

    try {
        const today = new Date();
        const startDate = getStartDate(today, currentPeriod);
        const data = await fetchMultipleDaysData(code, startDate, today);

        if (data.length > 0) {
            displayChart(data);
        } else {
            showError('No chart data available for this period.');
        }
    } catch (error) {
        console.error('Error loading chart data:', error);
        showError('Error loading chart data. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function fetchMultipleDaysData(code, startDate, endDate) {
    const allData = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        // Only fetch trading days (Mon-Fri)
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
            const dateStr = formatDate(currentDate);
            try {
                const response = await fetch(
                    `${TWSE_API_BASE}?response=json&date=${dateStr}&stockNo=${code}`
                );
                const result = await response.json();

                if (result.stat === 'OK' && result.data) {
                    allData.push(...result.data);
                }
            } catch (error) {
                console.error(`Error fetching data for ${dateStr}:`, error);
            }
        }

        currentDate.setDate(currentDate.getDate() + 1);

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allData.reverse();
}

function getStartDate(endDate, period) {
    const start = new Date(endDate);

    switch (period) {
        case '1d':
            start.setDate(start.getDate() - 1);
            break;
        case '1m':
            start.setMonth(start.getMonth() - 1);
            break;
        case '1y':
            start.setFullYear(start.getFullYear() - 1);
            break;
        case '5y':
            start.setFullYear(start.getFullYear() - 5);
            break;
    }

    return start;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function displayStockInfo(code, name, latestData) {
    // Parse TWSE data format
    const closePrice = parseFloat(latestData[6]);
    const openPrice = parseFloat(latestData[5]);
    const highPrice = parseFloat(latestData[3]);
    const lowPrice = parseFloat(latestData[4]);
    const volume = parseInt(latestData[2]);

    const change = closePrice - openPrice;
    const changePercent = (change / openPrice) * 100;

    document.getElementById('stockName').textContent = name;
    document.getElementById('stockCode').textContent = `Code: ${code}`;
    document.getElementById('currentPrice').textContent = `NT$ ${closePrice.toFixed(2)}`;

    const changeEl = document.getElementById('priceChange');
    const changeSign = change >= 0 ? '+' : '';
    changeEl.textContent = `${changeSign}${change.toFixed(2)} (${changeSign}${changePercent.toFixed(2)}%)`;
    changeEl.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('volume').textContent = `${(volume / 1000).toFixed(0)}K`;
    document.getElementById('high').textContent = `NT$ ${highPrice.toFixed(2)}`;
    document.getElementById('low').textContent = `NT$ ${lowPrice.toFixed(2)}`;
    document.getElementById('open').textContent = `NT$ ${openPrice.toFixed(2)}`;
}

function displayChart(data) {
    const labels = data.map(d => d[0]); // Date field
    const prices = data.map(d => parseFloat(d[6])); // Close price

    const ctx = document.getElementById('stockChart').getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Closing Price (NT$)',
                data: prices,
                borderColor: '#0066cc',
                backgroundColor: 'rgba(0, 102, 204, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: '#0066cc',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#004999',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#1a1a1a',
                        font: { size: 12, weight: 'bold' }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(0, 102, 204, 0.1)'
                    },
                    ticks: {
                        color: '#666',
                        callback: function (value) {
                            return 'NT$ ' + value.toFixed(0);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#666',
                        maxTicksLimit: 10
                    }
                }
            }
        }
    });
}

function showError(message) {
    errorSection.style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
    setTimeout(() => {
        errorSection.style.display = 'none';
    }, 5000);
}

function showLoading(show) {
    loadingSpinner.style.display = show ? 'flex' : 'none';
}

function clearSections() {
    infoSection.style.display = 'none';
    periodSection.style.display = 'none';
    chartSection.style.display = 'none';
    errorSection.style.display = 'none';
}
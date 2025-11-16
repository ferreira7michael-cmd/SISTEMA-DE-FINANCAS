const STORAGE_KEY = "mt_financas_v2"; // Mudei a chave para evitar conflito com dados antigos
const THEME_KEY = "mt_financas_theme";

// Estrutura de dados padrão e completa.
const defaultState = {
  transactions: [],
  categories: {
    income: ["Salário", "Outros"],
    expense: ["Mercado", "Contas", "Lazer"]
  },
  accounts: [],
  recurringTransactions: []
};

// O estado da aplicação.
let state = JSON.parse(JSON.stringify(defaultState)); // Deep copy
let navigationHistory = [];

// --- LÓGICA DE TEMA (MODO CLARO/ESCURO) ---
function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'light') {
    html.classList.add('light');
    html.classList.remove('dark');
  } else {
    html.classList.add('dark');
    html.classList.remove('light');
  }
  localStorage.setItem(THEME_KEY, theme);
  // Redesenha os gráficos ao mudar o tema para atualizar as cores
  if (expenseChart) renderExpenseChart();
  if (annualChart) renderAnnualReport();
}

function setupTheme() {
  const toggleButton = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem(THEME_KEY);
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const currentTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
  applyTheme(currentTheme);

  toggleButton.addEventListener('click', () => {
    const html = document.documentElement;
    const newTheme = html.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(newTheme);
  });
}


// --- PERSISTÊNCIA DE DADOS (CORREÇÃO FUNDAMENTAL) ---

// Função de "deep merge" para fundir dados salvos com o estado padrão.
function mergeDeep(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = mergeDeep(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state = JSON.parse(JSON.stringify(defaultState));
    return;
  }
  try {
    const savedData = JSON.parse(raw);
    // Usa a fusão profunda para garantir que a estrutura do estado não seja corrompida.
    state = mergeDeep(defaultState, savedData);
  } catch (e) {
    console.error("Erro ao ler ou mesclar dados salvos. Redefinindo para o padrão.", e);
    state = JSON.parse(JSON.stringify(defaultState));
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Erro ao salvar o estado:", e);
    alert("Não foi possível salvar os dados. O armazenamento pode estar cheio.");
  }
}

// --- UTILIDADES ---
function formatMoney(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDate(str) {
  if (!str) return "";
  // Adiciona o fuso horário para evitar problemas de data "um dia antes"
  const d = new Date(str + "T03:00:00");
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString("pt-BR");
}

// --- CONTROLE DE MÊS ---
let currentYear;
let reportYear;
let currentMonth; // 0-11

function setCurrentMonthToToday() {
  const today = new Date();
  currentYear = today.getFullYear();
  currentMonth = today.getMonth();
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  } else if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  renderMonthLabel();
  generateTransactionsForCurrentMonth();
  renderAll();
}

function renderMonthLabel() {
  const label = document.getElementById("currentMonthLabel");
  const date = new Date(currentYear, currentMonth, 1);
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  });
  label.textContent = formatter.format(date);
}

function isTransactionInCurrentMonth(t) {
  const d = new Date(t.date + "T03:00:00");
  return (
    d.getFullYear() === currentYear &&
    d.getMonth() === currentMonth
  );
}

// --- GERAÇÃO AUTOMÁTICA DE TRANSAÇÕES ---
function generateTransactionsForCurrentMonth() {
  const newTransactions = [];
  state.recurringTransactions.forEach(rec => {
    const monthId = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    // Verifica se já existe uma transação gerada para esta recorrência neste mês
    const alreadyExists = state.transactions.some(
      t => t.recurringId === rec.id && t.date.startsWith(monthId)
    );
    if (alreadyExists) return;

    let shouldGenerate = false;
    let description = rec.description;
    let transactionDate = new Date(currentYear, currentMonth, rec.dayOfMonth);

    if (rec.installmentType === 'fixed') {
      shouldGenerate = true;
    } else if (rec.installmentType === 'installment') {
      const startDate = new Date(rec.startDate + '-02T03:00:00'); // Use day 2 to avoid timezone issues
      const startYear = startDate.getFullYear();
      const startMonth = startDate.getMonth();
      
      const monthDiff = (currentYear - startYear) * 12 + (currentMonth - startMonth);
      
      if (monthDiff >= 0 && monthDiff < rec.totalInstallments) {
        shouldGenerate = true;
        description = `${rec.description} (${monthDiff + 1}/${rec.totalInstallments})`;
        transactionDate = new Date(currentYear, currentMonth, rec.dayOfMonth);
      }
    }

    if (shouldGenerate && rec.type === 'expense') {
      newTransactions.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2) + '-rec',
        recurringId: rec.id, // Vínculo com a recorrência pai
        type: 'expense',
        description: description,
        isPaid: false, // Despesas geradas começam como "não pagas"
        amount: rec.amount,
        date: transactionDate.toISOString().slice(0, 10),
        category: rec.category,
        accountId: rec.accountId,
        note: 'Gerado automaticamente'
      });                                                                                                        // A lógica de tipo de recorrência foi movida para o setup do formulário
    } else if (rec.type === 'income' && rec.installmentType === 'fixed' && rec.dayOfMonth <= new Date(currentYear, currentMonth + 1, 0).getDate()) {
      // Gera receita recorrente
      newTransactions.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2) + '-rec-in',
        recurringId: rec.id,
        type: 'income',
        description: rec.description,
        isPaid: false, // Receitas recorrentes nascem como "não recebidas"
        amount: rec.amount,
        date: new Date(currentYear, currentMonth, rec.dayOfMonth).toISOString().slice(0, 10),
        category: rec.category,
        accountId: rec.accountId,
        note: 'Receita recorrente gerada'
      });
    }
  });

  if (newTransactions.length > 0) {
    state.transactions.push(...newTransactions);
    saveState();
  }
}

// --- RENDERIZAÇÕES ---
function renderSummary() {
  const incomeSpan = document.getElementById("summaryIncome");
  const expenseSpan = document.getElementById("summaryExpense");
  const balanceSpan = document.getElementById("summaryBalance");

  let income = 0;
  let expense = 0;

  state.transactions.forEach((t) => {
    if (!isTransactionInCurrentMonth(t)) return;
    
    if (t.type === "income" && t.isPaid) {
        income += t.amount;
    } else if (t.type === "expense" && t.isPaid) {
        expense += t.amount;
    }
  });

  const balance = income - expense;

  incomeSpan.textContent = formatMoney(income);
  expenseSpan.textContent = formatMoney(expense);
  balanceSpan.textContent = formatMoney(balance);
}

function renderTransactionList() {
  const list = document.getElementById("transactionList");
  const emptyMessage = document.getElementById("emptyListMessage");
  list.innerHTML = "";

  const filtered = state.transactions
    .filter(isTransactionInCurrentMonth)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (filtered.length === 0) {
    emptyMessage.style.display = "block";
    return;
  }
  emptyMessage.style.display = "none";

  filtered.forEach((t) => {
    const li = document.createElement("li");
    if (!t.isPaid) { // Aplica para receitas e despesas não pagas/recebidas
        li.classList.add('unpaid');
    }

    const mainDiv = document.createElement("div");
    mainDiv.className = "transaction-main";

    const title = document.createElement("div");
    title.className = "transaction-title";
    title.textContent = t.description || "(Sem descrição)";

    const meta = document.createElement("div");
    meta.className = "transaction-meta";
    const accountName = state.accounts.find(a => a.id === t.accountId)?.name || 'Conta desconhecida';
    meta.textContent = `${formatDate(t.date)} • ${t.category} • ${accountName}`;
    
    mainDiv.appendChild(title);
    mainDiv.appendChild(meta);

    const amountSpan = document.createElement("span");
    amountSpan.className = "transaction-amount " + t.type;
    amountSpan.textContent = (t.type === "expense" ? "-" : "") + formatMoney(t.amount);

    const unmarkPaidBtn = document.createElement("button");
    unmarkPaidBtn.className = "unmark-paid-btn";
    unmarkPaidBtn.innerHTML = "🔄";
    unmarkPaidBtn.title = "Marcar como não pago";
    unmarkPaidBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const transaction = state.transactions.find(tx => tx.id === t.id);
        if (transaction) {
            transaction.isPaid = false;
            saveState();
            renderAll();
        }
    });

    const markPaidBtn = document.createElement("button");
    markPaidBtn.className = "mark-paid-btn";
    markPaidBtn.innerHTML = "✅";
    markPaidBtn.title = "Marcar como pago";
    markPaidBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const transaction = state.transactions.find(tx => tx.id === t.id);
        if (transaction) {
            transaction.isPaid = true;
            saveState();
            renderAll();
        }
    });

    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.innerHTML = "✏️";
    editBtn.title = "Editar lançamento";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Evita acionar outros eventos
      startEditTransaction(t.id);
    });


    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.title = "Excluir lançamento";
    deleteBtn.addEventListener("click", () => {
      if (confirm("Excluir este lançamento?")) {
        state.transactions = state.transactions.filter(
          (x) => x.id !== t.id
        );
        saveState();
        renderAll();
      }
    });

    li.appendChild(mainDiv);
    if (!t.isPaid) {
        li.appendChild(markPaidBtn);
    } else {
        li.appendChild(unmarkPaidBtn);
    }
    li.appendChild(editBtn);
    li.appendChild(amountSpan);
    li.appendChild(deleteBtn);

    list.appendChild(li);
  });
}

let expenseChart = null;
function renderExpenseChart() {
  const ctx = document.getElementById("expenseChart").getContext("2d");
  const expenses = state.transactions.filter(
    (t) => t.type === "expense" && t.isPaid && isTransactionInCurrentMonth(t)
  );

  const spendingByCategory = expenses.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount;
    return acc;
  }, {});

  const labels = Object.keys(spendingByCategory);
  const data = Object.values(spendingByCategory);

  if (expenseChart) {
    expenseChart.destroy();
  }

  if (labels.length === 0) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // Limpa o canvas
    return;
  }

  const chartColors = [
    "#a855f7", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
    "#d946ef", "#f43f5e", "#fb923c", "#ca8a04", "#16a34a", "#2563eb"
  ];

  expenseChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        label: "Despesas",
        data: data,
        backgroundColor: chartColors,
        borderColor: document.documentElement.classList.contains('light') ? 'var(--bg-elevated)' : 'rgba(15, 23, 42, 0.8)',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "var(--text-muted)",
            font: { size: 12 },
            boxWidth: 15,
            padding: 15
          }
        }
      }
    }
  });
}

let annualChart = null;
function renderAnnualReport() {
  if (!reportYear) reportYear = new Date().getFullYear();

  document.getElementById('currentYearLabel').textContent = reportYear;

  const monthlyData = Array(12).fill(0).map(() => ({ income: 0, expense: 0 }));
  let totalIncome = 0;
  let totalExpense = 0;

  state.transactions.forEach(t => {
    const transactionDate = new Date(t.date + "T03:00:00");
    if (transactionDate.getFullYear() === reportYear) {
      const month = transactionDate.getMonth(); // Apenas transações pagas/recebidas entram no relatório
      if (t.type === 'income') {
        monthlyData[month].income += t.amount;
        totalIncome += t.amount;
      } else if (t.type === 'expense') {
        if (t.isPaid) {
            monthlyData[month].expense += t.amount;
            totalExpense += t.amount;
        }
      }
      if (t.type === 'income' && t.isPaid) {
        monthlyData[month].income += t.amount;
        totalIncome += t.amount;
      } else if (t.type === 'expense' && t.isPaid) {
        monthlyData[month].expense += t.amount;
        totalExpense += t.amount;
      }
    }
  });

  // Atualiza os cards de resumo anual
  document.getElementById('annualIncome').textContent = formatMoney(totalIncome);
  document.getElementById('annualExpense').textContent = formatMoney(totalExpense);
  document.getElementById('annualBalance').textContent = formatMoney(totalIncome - totalExpense);

  // Renderiza o gráfico
  const ctx = document.getElementById("annualReportChart").getContext("2d");
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const incomeValues = monthlyData.map(d => d.income);
  const expenseValues = monthlyData.map(d => d.expense);

  if (annualChart) {
    annualChart.destroy();
  }

  annualChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Receitas',
          data: incomeValues,
          backgroundColor: 'rgba(34, 197, 94, 0.7)',
          borderColor: 'rgba(34, 197, 94, 1)',
          borderWidth: 1
        },
        {
          label: 'Despesas',
          data: expenseValues,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: 'var(--text-muted)' }
        },
        x: {
          ticks: { color: 'var(--text-muted)' }
        }
      },
      plugins: {
        legend: {
          labels: { color: 'var(--text-muted)' }
        }
      }
    }
  });
}

function renderCategories() {
  const incomeList = document.getElementById("incomeCategoryList");
  const expenseList = document.getElementById("expenseCategoryList");
  incomeList.innerHTML = "";
  expenseList.innerHTML = "";

  const createCategoryLi = (name, type, listElement) => {
    const li = document.createElement("li");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    li.appendChild(nameSpan);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.title = `Excluir categoria "${name}"`;
    deleteBtn.addEventListener("click", () => {
      if (!confirm(`Tem certeza que deseja excluir a categoria "${name}"?`)) return;
      
      state.categories[type] = state.categories[type].filter(c => c !== name);
      saveState();
      renderAll();
    });

    li.appendChild(deleteBtn);
    listElement.appendChild(li);
  };

  state.categories.income.forEach((c) => createCategoryLi(c, "income", incomeList));
  state.categories.expense.forEach((c) => createCategoryLi(c, "expense", expenseList));

  // Popula os selects dos formulários
  const categorySelect = document.getElementById("categorySelect");
  const accountSelect = document.getElementById("accountSelect");
  const fromAccountSelect = document.getElementById("fromAccountSelect");
  const toAccountSelect = document.getElementById("toAccountSelect");
  const recAccountSelect = document.getElementById("recAccountSelect");
  const recCategorySelect = document.getElementById("recCategorySelect");

  const currentType = document.querySelector('input[name="type"]:checked').value;
  const options = currentType === "income" ? state.categories.income : state.categories.expense;

  categorySelect.innerHTML = options.map(c => `<option value="${c}">${c}</option>`).join('');
  
  const accountOptions = state.accounts.map(acc => `<option value="${acc.id}">${acc.name}</option>`).join('');
  accountSelect.innerHTML = accountOptions;
  fromAccountSelect.innerHTML = accountOptions;
  toAccountSelect.innerHTML = accountOptions;
  recAccountSelect.innerHTML = accountOptions;

  if (state.accounts.length > 1) toAccountSelect.selectedIndex = 1;

  const expenseCategoryOptions = state.categories.expense.map(c => `<option value="${c}">${c}</option>`).join('');
  recCategorySelect.innerHTML = expenseCategoryOptions;
}

function renderAccounts() {
  const list = document.getElementById("accountsList");
  const emptyMessage = document.getElementById("emptyAccountsMessage");
  const manageList = document.getElementById("manageAccountsList");
  list.innerHTML = "";
  manageList.innerHTML = "";

  if (state.accounts.length === 0) {
    emptyMessage.style.display = "block";
    list.style.display = "none";
    manageList.style.display = "none";
    return;
  }

  emptyMessage.style.display = "none";
  list.style.display = "grid";
  manageList.style.display = "grid";

  state.accounts.forEach((acc) => {
    const currentBalance = state.transactions.reduce((balance, t) => {
      if (t.accountId !== acc.id || !t.isPaid) return balance; // Ignora não pagos/recebidos

      if (t.type === 'income' && t.isPaid) {
        return balance + t.amount;
      } else if (t.type === 'expense' && t.isPaid) {
        return balance - t.amount;
      }
      return balance;
    }, acc.initialBalance);

    const createAccountItem = (balance) => {
      const li = document.createElement("li");
      li.className = "account-item";
      li.innerHTML = `
        <img src="${acc.logoUrl || 'icon-192.png'}" alt="${acc.name}" onerror="this.src='icon-192.png'">
        <div class="account-item-info">
          <span>${acc.name}</span>
        </div>
        <span class="account-item-balance">${formatMoney(balance)}</span>
      `;
      return li;
    }

    list.appendChild(createAccountItem(currentBalance));

    const manageItem = createAccountItem(acc.initialBalance);
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.title = `Excluir conta "${acc.name}"`;
    deleteBtn.addEventListener("click", () => {
      if (!confirm(`Excluir a conta "${acc.name}"? TODOS os lançamentos associados a ela também serão excluídos. Esta ação não pode ser desfeita.`)) return;
      
      state.accounts = state.accounts.filter(a => a.id !== acc.id);
      state.transactions = state.transactions.filter(t => t.accountId !== acc.id);
      saveState();
      renderAll();
    });
    manageItem.appendChild(deleteBtn);
    manageList.appendChild(manageItem);
  });
}

function renderRecurringList() {
  const list = document.getElementById("recurringList");
  list.innerHTML = "";

  if (state.recurringTransactions.length === 0) {
    list.innerHTML = `<p class="empty-message">Nenhuma despesa recorrente cadastrada.</p>`;
    return;
  }

  state.recurringTransactions.forEach(rec => {
    const li = document.createElement("li");
    const typeText = rec.type === 'fixed' ? 'Fixo' : `Parcelado (${rec.totalInstallments}x)`;
    const accountName = state.accounts.find(a => a.id === rec.accountId)?.name || 'N/A';

    li.innerHTML = `
      <div class="transaction-main">
        <div class="transaction-title">${rec.description}</div>
        <div class="transaction-meta">${rec.type === 'income' ? 'Receita Fixa' : rec.installmentType === 'fixed' ? 'Despesa Fixa' : `Parcelado (${rec.totalInstallments}x)`} • Dia ${rec.dayOfMonth} • ${accountName}</div>
      </div>
      <span class="transaction-amount ${rec.type}">${formatMoney(rec.amount)}</span>
    `;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.title = "Excluir recorrência";
    deleteBtn.addEventListener("click", () => {
      if (confirm(`Deseja excluir a recorrência "${rec.description}"? Lançamentos já gerados não serão afetados.`)) {
        state.recurringTransactions = state.recurringTransactions.filter(r => r.id !== rec.id);
        saveState();
        renderAll();
      }
    });

    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

function renderUpcomingBills() {
  const list = document.getElementById('upcomingBillsList');
  const emptyMessage = document.getElementById('emptyBillsMessage');
  list.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Zera a hora para comparações de data
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const upcomingThreshold = new Date(today);
  upcomingThreshold.setDate(today.getDate() + 7); // Alerta para os próximos 7 dias

  const billsToShow = [];

  state.recurringTransactions.forEach(rec => {
    if (rec.type !== 'expense') return; // CORREÇÃO: Garante que apenas despesas apareçam aqui

    // Considera apenas contas do mês atual
    const dueDate = new Date(currentYear, currentMonth, rec.dayOfMonth, 3, 0, 0); // Adiciona fuso
    if (isNaN(dueDate.getTime())) return;

    // Verifica se já foi paga (se o lançamento gerado foi marcado como pago)
    const monthId = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const isPaid = state.transactions.some(
      t => t.recurringId === rec.id && t.date.startsWith(monthId) && t.isPaid
    );

    if (!isPaid) {
      if (dueDate < today) {
        billsToShow.push({ ...rec, status: 'overdue', dueDate });
      } else if (dueDate <= upcomingThreshold) {
        billsToShow.push({ ...rec, status: 'upcoming', dueDate });
      }
    }
  });

  if (billsToShow.length === 0) {
    emptyMessage.style.display = 'block';
    list.style.display = 'none';
    return;
  }

  emptyMessage.style.display = 'none';
  list.style.display = 'grid';

  billsToShow.sort((a, b) => a.dueDate - b.dueDate).forEach(bill => {
    const li = document.createElement('li');
    li.className = `bill-alert-item ${bill.status}`;
    li.innerHTML = `
      <div class="bill-alert-info">
        <div class="description">${bill.description}</div>
        <div class="due-date">Vence em: ${bill.dueDate.toLocaleDateString('pt-BR')}</div>
      </div>
      <span class="transaction-amount expense">${formatMoney(bill.amount)}</span>
    `;

    const markPaidBtn = document.createElement("button");
    markPaidBtn.className = "mark-paid-btn";
    markPaidBtn.innerHTML = "✅";
    markPaidBtn.title = "Marcar como pago";
    markPaidBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Ao marcar como pago, o lançamento é gerado e marcado como pago
        generateAndPayRecurring(bill.id);
    });

    li.appendChild(markPaidBtn);
    list.appendChild(li);
  });
}

function renderUpcomingIncome() {
  const list = document.getElementById('upcomingIncomeList');
  const emptyMessage = document.getElementById('emptyIncomeMessage');
  list.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const incomeToShow = [];

  state.recurringTransactions.forEach(rec => {
    if (rec.type !== 'income') return;

    const dueDate = new Date(currentYear, currentMonth, rec.dayOfMonth, 3, 0, 0);
    if (isNaN(dueDate.getTime())) return;

    const monthId = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const isReceived = state.transactions.some(
      t => t.recurringId === rec.id && t.date.startsWith(monthId) && t.isPaid
    );

    if (!isReceived) {
      incomeToShow.push({ ...rec, dueDate });
    }
  });

  if (incomeToShow.length === 0) {
    emptyMessage.style.display = 'block';
    list.style.display = 'none';
    return;
  }

  emptyMessage.style.display = 'none';
  list.style.display = 'grid';

  incomeToShow.sort((a, b) => a.dueDate - b.dueDate).forEach(income => {
    const li = document.createElement('li');
    li.className = 'bill-alert-item income';
    li.innerHTML = `
      <div class="bill-alert-info">
        <div class="description">${income.description}</div>
        <div class="due-date">Previsto para: ${income.dueDate.toLocaleDateString('pt-BR')}</div>
      </div>
      <span class="transaction-amount income">${formatMoney(income.amount)}</span>
    `;
    list.appendChild(li);
  });
}

function renderAll() {
  renderSummary();
  renderTransactionList();
  renderExpenseChart();
  renderAccounts();
  renderCategories();
  renderRecurringList();
  renderAnnualReport();
  renderUpcomingBills();
  renderUpcomingIncome();
}

function generateAndPayRecurring(recurringId) {
    const rec = state.recurringTransactions.find(r => r.id === recurringId);
    if (!rec) return;

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const transactionDate = new Date(currentYear, currentMonth, rec.dayOfMonth);

    // Procura se a transação já foi gerada mas não paga
    const existingUnpaid = state.transactions.find(t => t.recurringId === recurringId && !t.isPaid);
    if (existingUnpaid) {
        existingUnpaid.isPaid = true;
    } else {
        const newTransaction = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2) + '-paid',
            recurringId: rec.id,
            type: 'expense',
            description: rec.description,
            isPaid: true, // Já nasce como PAGO
            amount: rec.amount,
            date: transactionDate.toISOString().slice(0, 10),
            category: rec.category,
            accountId: rec.accountId,
            note: 'Marcado como pago manualmente'
        };
        state.transactions.push(newTransaction);
    }

    saveState();
    renderAll();
}


function updateHeaderForTab(tabId) {
    const body = document.body;
    const headerMonthPicker = document.getElementById('headerMonthPicker');
    const backBtn = document.getElementById('backBtn');
    const isSubPage = ['tab-add', 'tab-categories', 'tab-accounts', 'tab-transfer', 'tab-recurring'].includes(tabId);

    if (isSubPage) {
        body.classList.add('sub-page');
        headerMonthPicker.style.display = 'none';
        backBtn.style.display = 'flex';
    } else {
        body.classList.remove('sub-page');
        headerMonthPicker.style.display = 'inline-flex';
        backBtn.style.display = 'none';
    }
}
// --- CONFIGURAÇÃO DE EVENTOS ---
function setupTabs() {
  const navButtons = document.querySelectorAll(".bottom-nav .nav-button, .bottom-nav .fab-add");
  const moreLinkButtons = document.querySelectorAll(".more-list-item");
  const tabContents = document.querySelectorAll(".tab-content");

  function switchTab(tabId) {
      // Desativa todos os botões e conteúdos
      navButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      // Ativa o botão e conteúdo corretos
      const activeButton = document.querySelector(`.bottom-nav [data-tab="${tabId}"]`);
      if (activeButton) {
          activeButton.classList.add("active");
      }
      const activeContent = document.getElementById(tabId);
      if (activeContent) {
          activeContent.classList.add("active");
      }
      // A seção de contas a vencer é parte da tela de resumo
      if (tabId === 'tab-summary') {
          document.getElementById('tab-summary-bills').classList.add('active');
          document.getElementById('tab-summary-income').classList.add('active');
      }
      updateHeaderForTab(tabId);
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      // Clicar em um botão da nav principal (exceto o de adicionar) limpa o histórico
      if (!btn.classList.contains('fab-add')) {
        navigationHistory = [];
      }
      switchTab(tabId);
    });
  });

  moreLinkButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tabId = btn.dataset.tabLink;
        navigationHistory.push('tab-more'); // Salva a tela "Mais" no histórico
        switchTab(tabId);
      });
  });

  document.getElementById('backBtn').addEventListener('click', () => {
      if (navigationHistory.length > 0) {
          const lastTab = navigationHistory.pop();
          switchTab(lastTab);
      }
  });
}

function startEditTransaction(transactionId) {
  const transaction = state.transactions.find(t => t.id === transactionId);
  if (!transaction) {
    console.error("Lançamento não encontrado para edição.");
    return;
  }

  // Navega para a aba de formulário
  const activeTab = document.querySelector('.tab-content.active');
  if (activeTab) {
    navigationHistory.push(activeTab.id);
  }
  document.querySelector('.fab-add').dispatchEvent(new Event('click'));

  // Preenche o formulário com os dados do lançamento
  const form = document.getElementById("transactionForm");
  form.elements.transactionId.value = transaction.id;
  form.elements.type.value = transaction.type;
  form.elements.description.value = transaction.description;
  form.elements.amount.value = transaction.amount;
  form.elements.date.value = transaction.date;
  form.elements.note.value = transaction.note;

  // Atualiza as categorias e contas com base no tipo do lançamento
  renderCategories();

  // Seleciona a categoria e a conta corretas
  form.elements.category.value = transaction.category;
  form.elements.accountId.value = transaction.accountId;

  // Atualiza a UI para o modo de edição
  document.getElementById("formTitle").textContent = "Editar Lançamento";
  document.getElementById("formSubmitBtn").textContent = "Atualizar Lançamento";
}

function setupForm() {
  const form = document.getElementById("transactionForm");
  const dateInput = form.elements["date"];
  dateInput.value = new Date().toISOString().slice(0, 10);

  form.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.addEventListener("change", renderCategories);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.accounts.length === 0) {
      alert("Você precisa cadastrar uma conta primeiro! Vá para a aba 'Contas'.");
      document.querySelector('.nav-button[data-tab="tab-more"]').click();
      // A navegação para a sub-aba de contas é mais complexa agora, mas o usuário é direcionado para a tela "Mais"
      return;
    }

    const amount = parseFloat(form.elements.amount.value.replace(",", "."));
    if (isNaN(amount) || amount <= 0) {
      alert("O valor do lançamento é inválido.");
      return;
    }

    const transactionData = {
      type: form.elements.type.value,
      description: form.elements.description.value.trim(),
      amount,
      date: form.elements.date.value,
      category: form.elements.category.value,
      accountId: form.elements.accountId.value,
      note: form.elements.note.value.trim()
    };

    const editingId = form.elements.transactionId.value;

    if (editingId) {
      // Modo de Edição: Atualiza o lançamento existente
      const index = state.transactions.findIndex(t => t.id === editingId);
      if (index !== -1) {
        // Preserva o status 'isPaid' ao editar, a menos que seja uma nova entrada
        const isPaid = transactionData.type === 'income' ? true : state.transactions[index].isPaid;
        state.transactions[index] = { ...state.transactions[index], ...transactionData, isPaid };
      }
    } else {
      // Modo de Adição: Cria um novo lançamento
      const newTransaction = {
        ...transactionData,
        isPaid: true, // Transação nova criada manualmente já nasce como paga/recebida
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      };
      state.transactions.push(newTransaction);
    }

    saveState();
    renderAll();
    resetForm();
    // Volta para a tela anterior após salvar
    if (navigationHistory.length > 0) {
        document.getElementById('backBtn').click();
    }
  });

  function resetForm() {
    form.reset();
    form.elements.transactionId.value = '';
    dateInput.value = new Date().toISOString().slice(0, 10);
    // Não chama renderCategories aqui para não perder a seleção do tipo
    renderCategories();
    document.getElementById("formTitle").textContent = "Novo Lançamento";
    document.getElementById("formSubmitBtn").textContent = "Salvar Lançamento";
  }
}

function setupAccountForm() {
  const form = document.getElementById("accountForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.elements["accountName"].value.trim();
    const initialBalance = parseFloat(form.elements["accountBalance"].value.replace(",", "."));

    if (!name || isNaN(initialBalance)) {
      alert("Preencha o nome e o saldo inicial da conta corretamente.");
      return;
    }

    const newAccount = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name,
      initialBalance,
      logoUrl: form.elements["accountLogo"].value.trim()
    };

    state.accounts.push(newAccount);
    saveState();
    renderAll();
    form.reset();
    document.querySelector('.nav-button[data-tab="tab-summary"]').click();
  });
}

function setupCategoryForms() {
  document.querySelectorAll(".category-form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const type = form.dataset.type;
      const input = form.querySelector("input");
      const name = input.value.trim();
      if (!name) return;
      if (!state.categories[type].includes(name)) {
        state.categories[type].push(name);
        saveState();
        renderAll();
      }
      input.value = "";
    });
  });
}

function setupMonthButtons() {
  document.getElementById("prevMonthBtn").addEventListener("click", () => changeMonth(-1));
  document.getElementById("nextMonthBtn").addEventListener("click", () => changeMonth(1));
}

function setupYearPicker() {
  reportYear = new Date().getFullYear();
  document.getElementById('prevYearBtn').addEventListener('click', () => {
    reportYear--;
    renderAnnualReport();
  });
  document.getElementById('nextYearBtn').addEventListener('click', () => {
    reportYear++;
    renderAnnualReport();
  });
}

function setupClearMonth() {
  document.getElementById("clearMonthBtn").addEventListener("click", () => {
    if (!confirm("Excluir todos os lançamentos deste mês? Essa ação não pode ser desfeita.")) return;
    
    state.transactions = state.transactions.filter(t => !isTransactionInCurrentMonth(t));
    saveState();
    renderAll();
  });
}

function setupTransferForm() {
  const form = document.getElementById("transferForm");
  const dateInput = form.elements["transferDate"];
  dateInput.value = new Date().toISOString().slice(0, 10);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.accounts.length < 2) {
      alert("Você precisa de pelo menos duas contas para fazer uma transferência.");
      return;
    }

    const fromAccountId = form.elements["fromAccountId"].value;
    const toAccountId = form.elements["toAccountId"].value;
    const amount = parseFloat(form.elements["transferAmount"].value.replace(",", "."));
    const date = form.elements["transferDate"].value;

    if (fromAccountId === toAccountId) {
      alert("A conta de origem e destino não podem ser a mesma.");
      return;
    }
    if (!fromAccountId || !toAccountId || isNaN(amount) || amount <= 0) {
      alert("Preencha todos os campos corretamente.");
      return;
    }

    const fromAccountName = state.accounts.find(a => a.id === fromAccountId)?.name;
    const toAccountName = state.accounts.find(a => a.id === toAccountId)?.name;
    const expenseCategory = "Transferência Enviada";
    const incomeCategory = "Transferência Recebida";

    const expenseTransaction = {
      id: Date.now().toString(36) + "-out", type: "expense", isPaid: true,
      description: `Transferência para ${toAccountName}`, amount, date,
      category: expenseCategory, accountId: fromAccountId, note: "Transferência entre contas"
    };
    const incomeTransaction = {
      id: Date.now().toString(36) + "-in", type: "income", isPaid: true,
      description: `Transferência de ${fromAccountName}`, amount, date,
      category: incomeCategory, accountId: toAccountId, note: "Transferência entre contas"
    };

    state.transactions.push(expenseTransaction, incomeTransaction);
    saveState();
    renderAll();
    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    document.querySelector('.nav-button[data-tab="tab-summary"]').click();
  });
}

function setupRecurringForm() {
  const form = document.getElementById("recurringForm");
  const recTypeRadios = form.querySelectorAll('input[name="recTransactionType"]');
  const typeSelect = document.getElementById("recTypeSelect");
  const fixedOptions = document.getElementById("fixedOptions");
  const installmentOptions = document.getElementById("installmentOptions");
  const startDateInput = form.elements.recStartDate;

  // Define o valor padrão do mês de início
  const today = new Date();
  startDateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  recTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        const type = e.target.value;
        const recCategorySelect = document.getElementById("recCategorySelect");
        const categoryOptions = (type === 'income' ? state.categories.income : state.categories.expense)
            .map(c => `<option value="${c}">${c}</option>`).join('');
        recCategorySelect.innerHTML = categoryOptions;

        // Oculta opções de parcelamento para receitas
        if (type === 'income') {
            typeSelect.style.display = 'none';
            installmentOptions.style.display = 'none';
        } else {
            typeSelect.style.display = 'block';
        }
    });
  });

  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'fixed') {
      fixedOptions.style.display = 'block';
      installmentOptions.style.display = 'none';
    } else {
      fixedOptions.style.display = 'none';
      installmentOptions.style.display = 'block';
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.accounts.length === 0) {
      alert("Cadastre uma conta primeiro.");
      return;
    }

    const amount = parseFloat(form.elements.recAmount.value.replace(",", "."));
    if (isNaN(amount) || amount <= 0) {
      alert("Valor inválido.");
      return;
    }

    const transactionType = form.elements.recTransactionType.value;
    const newRecurrence = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      description: form.elements.recDescription.value.trim(),
      amount,
      accountId: form.elements.recAccountId.value,
      category: form.elements.recCategory.value,
      type: transactionType, // 'income' ou 'expense'
      installmentType: transactionType === 'expense' ? form.elements.recType.value : 'fixed', // 'fixed' ou 'installment'
      dayOfMonth: parseInt(form.elements.recDayOfMonth.value) || 10,
      totalInstallments: parseInt(form.elements.recTotalInstallments.value) || null,
      startDate: form.elements.recStartDate.value || null,
    };

    if (newRecurrence.type === 'installment' && (!newRecurrence.totalInstallments || !newRecurrence.startDate)) {
      alert("Para despesas parceladas, preencha o número de parcelas e o mês de início.");
      return;
    }

    state.recurringTransactions.push(newRecurrence);
    saveState();
    generateTransactionsForCurrentMonth(); // Gera para o mês atual, se aplicável
    renderAll();
    form.reset();
    startDateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
}

function setupServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register("
    });
  }
}

// --- INICIALIZAÇÃO ---
document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  loadState();
  setCurrentMonthToToday();
  generateTransactionsForCurrentMonth();
  renderMonthLabel();
  setupTabs();
  setupForm();
  setupAccountForm();
  setupCategoryForms();
  setupMonthButtons();
  setupYearPicker();
  setupRecurringForm();
  setupTransferForm();
  // setupClearMonth deve ser chamado depois de setupTabs para garantir que o botão exista
  setupClearMonth();
  renderAll();
  setupServiceWorker();
});

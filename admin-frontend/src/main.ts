/**
 * M01 環境驗證用最小 Vue app。
 * M23 將擴充為完整後台（兩步登入 / PlayersView / GiftCodeView / RecordsView / MonitorView）。
 */
import { createApp, h } from 'vue';

const App = {
  name: 'AdminApp',
  render: () => h('h1', 'Admin frontend works'),
};

createApp(App).mount('#app');

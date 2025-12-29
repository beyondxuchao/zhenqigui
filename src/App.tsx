import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import dayjs from 'dayjs';
import MainLayout from './layouts/mainlayout';
import Home from './pages/home';
import Settings from './pages/settings';
import MaterialMatch from './pages/materialmatch';
import MovieDetails from './pages/MovieDetails';
import Statistics from './pages/statistics';
import CalendarPage from './pages/calendarpage';
import Tools from './pages/tools';
import { AppProvider, useApp } from './context/appcontext';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

const AppContent: React.FC = () => {
  const { isDark, primaryColor } = useApp();

  useEffect(() => {
    dayjs.locale('zh-cn');
  }, []);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
             colorPrimary: primaryColor,
        }
      }}
    >
      <AntApp>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Home />} />
              <Route path="settings" element={<Settings />} />
              <Route path="match" element={<MaterialMatch />} />
              <Route path="match/:id" element={<MaterialMatch />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="details/:id" element={<MovieDetails />} />
              <Route path="statistics" element={<Statistics />} />
              <Route path="tools" element={<Tools />} />
            </Route>
          </Routes>
      </AntApp>
    </ConfigProvider>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
        <Router>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </Router>
    </AppProvider>
  );
};

export default App;

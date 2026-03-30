import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  BarChart3, ShoppingCart, LogOut, Wifi, Menu, X, ChevronRight,
  LayoutDashboard, MapPin, TrendingDown, Package, AlertTriangle
} from 'lucide-react'

const T = {
  bg: '#0f0a1e',
  sidebar: '#150f2b',
  sidebarBorder: '#2d2152',
  accent: '#7c3aed',
  gold: '#f5a623',
  pink: '#e74fc4',
  cyan: '#06d6a0',
  textPrimary: '#f1f5f9',
  textMuted: '#7c6fa0',
}

const navItems = [
  { path: '/visao-geral', label: 'Visão Geral', icon: LayoutDashboard },
  { path: '/', label: 'Financeiro', icon: BarChart3 },
  { path: '/comercial', label: 'Comercial', icon: ShoppingCart },
  { path: '/geografico', label: 'Geográfico', icon: MapPin },
  { path: '/churn', label: 'Churn', icon: TrendingDown },
  { path: '/planos', label: 'Planos', icon: Package },
  { path: '/alertas', label: 'Alertas', icon: AlertTriangle },
]

export const Layout = ({ children }) => {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen" style={{ background: T.bg }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col transition-all duration-300 sticky top-0 h-screen z-30"
        style={{
          width: collapsed ? 64 : 200,
          background: T.sidebar,
          borderRight: `1px solid ${T.sidebarBorder}`,
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: `1px solid ${T.sidebarBorder}` }}>
          <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${T.gold}, ${T.pink})` }}>
            <Wifi className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <span className="text-xs font-bold" style={{ color: T.textMuted }}>./</span>
              <span className="text-xs font-bold" style={{ color: T.textPrimary }}>ISP</span>
              <span className="text-xs font-bold" style={{ color: T.gold }}>ANALYTICS</span>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-2 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                  isActive ? '' : 'hover:opacity-80'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? `${T.accent}22` : 'transparent',
                color: isActive ? T.cyan : T.textMuted,
                borderLeft: isActive ? `3px solid ${T.cyan}` : '3px solid transparent',
              })}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: collapse toggle + logout */}
        <div className="px-2 pb-3 space-y-1" style={{ borderTop: `1px solid ${T.sidebarBorder}`, paddingTop: 12 }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs w-full transition-all hover:opacity-80"
            style={{ color: T.textMuted }}
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
            {!collapsed && <span>Recolher</span>}
          </button>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs w-full transition-all hover:opacity-80"
            style={{ color: T.textMuted }}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export default Layout

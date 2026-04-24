import React, { useState, useEffect, useMemo } from 'react'
import { apiService } from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  Settings, Plus, Pencil, Trash2, RefreshCw, CheckCircle2, XCircle,
  Wifi, Server, ChevronDown, ChevronUp, Zap, AlertCircle, Eye, EyeOff,
  TestTube, Loader2, Clock
} from 'lucide-react'

/* ═══════════════ THEME ═══════════════ */

const T = {
  bg: '#0f0a1e',
  card: '#1a1232',
  cardBorder: '#2d2152',
  accent: '#7c3aed',
  cyan: '#06d6a0',
  gold: '#f5a623',
  pink: '#e74fc4',
  red: '#ef4444',
  green: '#10b981',
  orange: '#f97316',
  textPrimary: '#f1f5f9',
  textSecondary: '#a78bfa',
  textMuted: '#7c6fa0',
  input: '#150f2b',
  inputBorder: '#352a5c',
  inputFocus: '#7c3aed',
}

/* ═══════════════ ERP DEFINITIONS ═══════════════ */

const ERP_TYPES = {
  hubsoft: {
    label: 'HubSoft',
    color: '#3b82f6',
    icon: '🔷',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://api.exemplo.hubsoft.com.br', required: true },
      { key: 'clientId', label: 'Client ID', placeholder: 'Ex: 46', required: true },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Chave secreta OAuth2', required: true, sensitive: true },
      { key: 'username', label: 'Usuário', placeholder: 'email@provedor.com.br', required: true },
      { key: 'password', label: 'Senha', placeholder: 'Senha de acesso', required: true, sensitive: true },
    ]
  },
  ixc: {
    label: 'IXCSoft',
    color: '#f97316',
    icon: '🟠',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://api.exemplo.ixcsoft.com.br', required: true },
      { key: 'token', label: 'Token de Acesso', placeholder: 'Token de autenticação', required: true, sensitive: true },
    ]
  },
  sgp: {
    label: 'SGP',
    color: '#10b981',
    icon: '🟢',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://api.exemplo.sgp.com.br', required: true },
      { key: 'token', label: 'Token', placeholder: 'Token de acesso', required: true, sensitive: true },
      { key: 'app', label: 'App ID', placeholder: 'Identificador da aplicação', required: true },
    ]
  },
  mkauth: {
    label: 'MKAuth',
    color: '#e74fc4',
    icon: '🟣',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://mkauth.exemplo.com.br', required: true },
      { key: 'token', label: 'Token', placeholder: 'Token de autenticação', required: true, sensitive: true },
    ]
  }
}

/* ═══════════════ HELPER COMPONENTS ═══════════════ */

const StatusBadge = ({ status }) => {
  const map = {
    success: { color: T.green, label: 'Sincronizado', icon: CheckCircle2 },
    error: { color: T.red, label: 'Erro', icon: XCircle },
    running: { color: T.gold, label: 'Sincronizando...', icon: RefreshCw },
    never: { color: T.textMuted, label: 'Nunca sincronizado', icon: Clock },
  }
  const s = map[status] || map.never
  const Icon = s.icon
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium"
      style={{ background: `${s.color}18`, color: s.color }}>
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {s.label}
    </span>
  )
}

const ErpBadge = ({ erp }) => {
  const e = ERP_TYPES[erp] || { label: erp, color: T.textMuted, icon: '⚪' }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
      style={{ background: `${e.color}18`, color: e.color }}>
      {e.icon} {e.label}
    </span>
  )
}

/* ═══════════════ PROVIDER FORM MODAL ═══════════════ */

const ProviderFormModal = ({ provider, onClose, onSaved }) => {
  const isEdit = !!provider
  const [name, setName] = useState(provider?.name || '')
  const [erp, setErp] = useState(provider?.erp || 'hubsoft')
  const [config, setConfig] = useState(provider?.config || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [showSensitive, setShowSensitive] = useState({})

  const erpDef = ERP_TYPES[erp]
  const fields = erpDef?.fields || []

  const handleConfigChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const toggleSensitive = (key) => {
    setShowSensitive(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) { setError('Nome é obrigatório'); return }

    // Validate required fields
    for (const f of fields) {
      if (f.required && !config[f.key]) {
        setError(`${f.label} é obrigatório`)
        return
      }
    }

    setSaving(true)
    try {
      if (isEdit) {
        await apiService.updateProvider(provider._id || provider.id, { name, erp, config })
      } else {
        await apiService.createProvider({ name, erp, config })
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar provedor')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!isEdit) return
    setTesting(true)
    setTestResult(null)
    try {
      // First save any changes, then validate
      await apiService.updateProvider(provider._id || provider.id, { name, erp, config })
      const res = await apiService.validateProvider(provider._id || provider.id)
      setTestResult(res.data)
    } catch (err) {
      setTestResult({ ok: false, message: err.response?.data?.message || err.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${T.accent}22` }}>
              {isEdit ? <Pencil className="w-4 h-4" style={{ color: T.accent }} /> :
                <Plus className="w-4 h-4" style={{ color: T.accent }} />}
            </div>
            <h2 className="text-sm font-bold" style={{ color: T.textPrimary }}>
              {isEdit ? 'Editar Provedor' : 'Novo Provedor'}
            </h2>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg hover:opacity-80"
            style={{ color: T.textMuted, background: `${T.cardBorder}44` }}>
            Fechar
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Name */}
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: T.textMuted }}>
              Nome do Provedor *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Libernet, ISP Sul, NetFibra"
              className="w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none transition-all"
              style={{
                background: T.input, border: `1px solid ${T.inputBorder}`,
                color: T.textPrimary
              }}
              onFocus={e => e.target.style.borderColor = T.inputFocus}
              onBlur={e => e.target.style.borderColor = T.inputBorder}
            />
          </div>

          {/* ERP Type */}
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: T.textMuted }}>
              Sistema / ERP *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ERP_TYPES).map(([key, def]) => (
                <button key={key} type="button"
                  onClick={() => { setErp(key); setConfig({}) }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: erp === key ? `${def.color}22` : T.input,
                    border: `1px solid ${erp === key ? def.color : T.inputBorder}`,
                    color: erp === key ? def.color : T.textMuted,
                  }}>
                  <span>{def.icon}</span>
                  {def.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Config Fields */}
          <div className="pt-2" style={{ borderTop: `1px solid ${T.cardBorder}` }}>
            <p className="text-[11px] font-medium mb-3" style={{ color: T.textSecondary }}>
              Configuração da API — {erpDef?.label}
            </p>
            <div className="space-y-3">
              {fields.map(f => (
                <div key={f.key}>
                  <label className="block text-[10px] font-medium mb-1" style={{ color: T.textMuted }}>
                    {f.label} {f.required && '*'}
                  </label>
                  <div className="relative">
                    <input
                      type={f.sensitive && !showSensitive[f.key] ? 'password' : 'text'}
                      value={config[f.key] || ''}
                      onChange={e => handleConfigChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none transition-all pr-9"
                      style={{
                        background: T.input, border: `1px solid ${T.inputBorder}`,
                        color: T.textPrimary
                      }}
                      onFocus={e => e.target.style.borderColor = T.inputFocus}
                      onBlur={e => e.target.style.borderColor = T.inputBorder}
                    />
                    {f.sensitive && (
                      <button type="button" onClick={() => toggleSensitive(f.key)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        style={{ color: T.textMuted }}>
                        {showSensitive[f.key] ?
                          <EyeOff className="w-3.5 h-3.5" /> :
                          <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Test connection result */}
          {testResult && (
            <div className="rounded-xl p-3 flex items-start gap-2 text-xs"
              style={{
                background: testResult.ok ? `${T.green}12` : `${T.red}12`,
                border: `1px solid ${testResult.ok ? T.green : T.red}33`
              }}>
              {testResult.ok ?
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: T.green }} /> :
                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: T.red }} />}
              <span style={{ color: testResult.ok ? T.green : T.red }}>
                {testResult.message}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl p-3 flex items-center gap-2 text-xs"
              style={{ background: `${T.red}12`, border: `1px solid ${T.red}33` }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: T.red }} />
              <span style={{ color: T.red }}>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {isEdit && (
                <button type="button" onClick={handleTest} disabled={testing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40"
                  style={{ background: `${T.cyan}18`, color: T.cyan }}>
                  {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                  {testing ? 'Testando...' : 'Testar Conexão'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-[11px] font-medium"
                style={{ color: T.textMuted, background: `${T.cardBorder}44` }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold transition-all disabled:opacity-40"
                style={{ background: T.accent, color: '#fff' }}>
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Provedor'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════ DELETE CONFIRMATION MODAL ═══════════════ */

const DeleteModal = ({ provider, onClose, onConfirm }) => {
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

  const handleDelete = async () => {
    setConfirming(true)
    try {
      await apiService.deleteProvider(provider._id || provider.id)
      onConfirm()
    } catch {
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: T.card, border: `1px solid ${T.red}33` }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${T.red}18` }}>
            <Trash2 className="w-5 h-5" style={{ color: T.red }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>Excluir Provedor</h3>
            <p className="text-[10px]" style={{ color: T.textMuted }}>Esta ação é irreversível</p>
          </div>
        </div>

        <p className="text-xs mb-3" style={{ color: T.textMuted }}>
          Todos os dados associados a <strong style={{ color: T.textPrimary }}>{provider.name}</strong> serão
          excluídos permanentemente (clientes, faturas, O.S.).
        </p>

        <p className="text-[10px] mb-2" style={{ color: T.textMuted }}>
          Digite <strong style={{ color: T.red }}>EXCLUIR</strong> para confirmar:
        </p>
        <input
          type="text"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-xs mb-4 focus:outline-none"
          style={{ background: T.input, border: `1px solid ${T.inputBorder}`, color: T.textPrimary }}
          placeholder="EXCLUIR"
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[11px] font-medium"
            style={{ color: T.textMuted, background: `${T.cardBorder}44` }}>
            Cancelar
          </button>
          <button onClick={handleDelete}
            disabled={typed !== 'EXCLUIR' || confirming}
            className="px-4 py-2 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30"
            style={{ background: T.red, color: '#fff' }}>
            {confirming ? 'Excluindo...' : 'Excluir Permanentemente'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════ SYNC SCHEDULE PANEL ═══════════════ */

const SyncSchedulePanel = () => {
  const [incMinutes, setIncMinutes] = useState(5)
  const [fullHour, setFullHour] = useState(3)
  const [fullMinute, setFullMinute] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiService.getSyncSettings().then(res => {
      const s = res.data.settings || {}
      setIncMinutes(s.incrementalMinutes ?? 5)
      setFullHour(s.fullSyncHour ?? 3)
      setFullMinute(s.fullSyncMinute ?? 0)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await apiService.updateSyncSettings({
        incrementalMinutes: incMinutes,
        fullSyncHour: fullHour,
        fullSyncMinute: fullMinute
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  // Helper: format display text
  const incLabel = incMinutes >= 60
    ? `${Math.floor(incMinutes / 60)}h${incMinutes % 60 > 0 ? ` ${incMinutes % 60}min` : ''}`
    : `${incMinutes} min`

  const fullLabel = `${String(fullHour).padStart(2, '0')}:${String(fullMinute).padStart(2, '0')}`

  return (
    <div className="rounded-2xl mt-6" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${T.cyan}18` }}>
          <Clock className="w-4 h-4" style={{ color: T.cyan }} />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>Agendamento de Sincronização</h3>
          <p className="text-[10px]" style={{ color: T.textMuted }}>
            Configure o intervalo do sync incremental e o horário do sync completo
          </p>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Incremental Sync */}
          <div className="rounded-xl p-4" style={{ background: T.bg, border: `1px solid ${T.cardBorder}` }}>
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="w-4 h-4" style={{ color: T.gold }} />
              <h4 className="text-xs font-bold" style={{ color: T.gold }}>Sync Incremental</h4>
            </div>
            <p className="text-[10px] mb-3" style={{ color: T.textMuted }}>
              Sincroniza dados novos/atualizados periodicamente. Define o intervalo em minutos.
            </p>

            <label className="block text-[10px] font-medium mb-1.5" style={{ color: T.textMuted }}>
              Intervalo (minutos)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1" max="120" step="1"
                value={incMinutes}
                onChange={e => setIncMinutes(parseInt(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: T.gold, background: T.cardBorder }}
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1" max="1440"
                  value={incMinutes}
                  onChange={e => {
                    const v = parseInt(e.target.value)
                    if (!isNaN(v) && v >= 1 && v <= 1440) setIncMinutes(v)
                  }}
                  className="w-16 px-2 py-1.5 rounded-lg text-xs text-center focus:outline-none"
                  style={{ background: T.input, border: `1px solid ${T.inputBorder}`, color: T.textPrimary }}
                />
                <span className="text-[10px]" style={{ color: T.textMuted }}>min</span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Zap className="w-3 h-3" style={{ color: T.cyan }} />
              <span className="text-[10px]" style={{ color: T.cyan }}>
                Executará a cada <strong>{incLabel}</strong>
              </span>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {[
                { label: '5 min', v: 5 },
                { label: '15 min', v: 15 },
                { label: '30 min', v: 30 },
                { label: '1 hora', v: 60 },
                { label: '2 horas', v: 120 },
              ].map(p => (
                <button key={p.v} onClick={() => setIncMinutes(p.v)}
                  className="px-2 py-1 rounded text-[10px] font-medium transition-all"
                  style={{
                    background: incMinutes === p.v ? `${T.gold}22` : `${T.cardBorder}44`,
                    color: incMinutes === p.v ? T.gold : T.textMuted,
                    border: `1px solid ${incMinutes === p.v ? T.gold + '44' : 'transparent'}`
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Full Sync */}
          <div className="rounded-xl p-4" style={{ background: T.bg, border: `1px solid ${T.cardBorder}` }}>
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="w-4 h-4" style={{ color: T.accent }} />
              <h4 className="text-xs font-bold" style={{ color: T.accent }}>Sync Completo</h4>
            </div>
            <p className="text-[10px] mb-3" style={{ color: T.textMuted }}>
              Sincronização completa de todos os dados. Executada uma vez por dia no horário escolhido.
            </p>

            <label className="block text-[10px] font-medium mb-1.5" style={{ color: T.textMuted }}>
              Horário de execução
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <select
                  value={fullHour}
                  onChange={e => setFullHour(parseInt(e.target.value))}
                  className="px-2 py-1.5 rounded-lg text-xs focus:outline-none cursor-pointer"
                  style={{ background: T.input, border: `1px solid ${T.inputBorder}`, color: T.textPrimary }}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-sm font-bold" style={{ color: T.textMuted }}>:</span>
                <select
                  value={fullMinute}
                  onChange={e => setFullMinute(parseInt(e.target.value))}
                  className="px-2 py-1.5 rounded-lg text-xs focus:outline-none cursor-pointer"
                  style={{ background: T.input, border: `1px solid ${T.inputBorder}`, color: T.textPrimary }}>
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>
              <span className="text-[10px]" style={{ color: T.textMuted }}>horas</span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Zap className="w-3 h-3" style={{ color: T.cyan }} />
              <span className="text-[10px]" style={{ color: T.cyan }}>
                Executará diariamente às <strong>{fullLabel}</strong>
              </span>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {[
                { label: '00:00', h: 0, m: 0 },
                { label: '02:00', h: 2, m: 0 },
                { label: '03:00', h: 3, m: 0 },
                { label: '04:00', h: 4, m: 0 },
                { label: '06:00', h: 6, m: 0 },
              ].map(p => (
                <button key={p.label}
                  onClick={() => { setFullHour(p.h); setFullMinute(p.m) }}
                  className="px-2 py-1 rounded text-[10px] font-medium transition-all"
                  style={{
                    background: fullHour === p.h && fullMinute === p.m ? `${T.accent}22` : `${T.cardBorder}44`,
                    color: fullHour === p.h && fullMinute === p.m ? T.accent : T.textMuted,
                    border: `1px solid ${fullHour === p.h && fullMinute === p.m ? T.accent + '44' : 'transparent'}`
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Save button + feedback */}
        <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: `1px solid ${T.cardBorder}` }}>
          <div>
            {error && (
              <span className="text-[11px] flex items-center gap-1" style={{ color: T.red }}>
                <AlertCircle className="w-3 h-3" /> {error}
              </span>
            )}
            {saved && (
              <span className="text-[11px] flex items-center gap-1" style={{ color: T.green }}>
                <CheckCircle2 className="w-3 h-3" /> Configurações salvas e scheduler reiniciado
              </span>
            )}
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-[11px] font-bold transition-all disabled:opacity-40 hover:opacity-90"
            style={{ background: T.accent, color: '#fff' }}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            {saving ? 'Salvando...' : 'Salvar Agendamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════ MAIN PAGE ═══════════════ */

export const Configuracoes = () => {
  const { user } = useAuth()
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editProvider, setEditProvider] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [syncing, setSyncing] = useState({})
  const [expandedId, setExpandedId] = useState(null)

  const fetchProviders = async () => {
    try {
      const res = await apiService.getProviders()
      setProviders(res.data.providers || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchProviders() }, [])

  const handleEdit = async (provider) => {
    try {
      const res = await apiService.getProvider(provider._id || provider.id)
      setEditProvider(res.data.provider)
      setShowForm(true)
    } catch {
      setEditProvider(provider)
      setShowForm(true)
    }
  }

  const handleSync = async (provider) => {
    const id = provider._id || provider.id
    setSyncing(prev => ({ ...prev, [id]: true }))
    try {
      await apiService.triggerSync(id)
      // Poll for completion
      setTimeout(() => fetchProviders(), 5000)
      setTimeout(() => { fetchProviders(); setSyncing(prev => ({ ...prev, [id]: false })) }, 15000)
    } catch {
      setSyncing(prev => ({ ...prev, [id]: false }))
    }
  }

  const handleFormSaved = () => {
    setShowForm(false)
    setEditProvider(null)
    fetchProviders()
  }

  const handleDeleteConfirmed = () => {
    setDeleteTarget(null)
    fetchProviders()
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen overflow-auto" style={{ background: T.bg }}>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 sticky top-0 z-20"
        style={{ background: '#150f2bdd', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.cardBorder}` }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f5a623, #e74fc4)' }}>
            <Wifi className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold" style={{ color: T.gold }}>Configurações</span>
            <span className="text-sm font-bold" style={{ color: T.textMuted }}> — Provedores API</span>
          </div>
        </div>

        <button
          onClick={() => { setEditProvider(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold transition-all hover:opacity-90"
          style={{ background: T.accent, color: '#fff' }}>
          <Plus className="w-3.5 h-3.5" />
          Novo Provedor
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 p-4 lg:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-3"
                style={{ borderColor: `${T.accent}33`, borderTopColor: T.accent }} />
              <p className="text-xs" style={{ color: T.textMuted }}>Carregando provedores...</p>
            </div>
          </div>
        ) : providers.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: `${T.accent}15` }}>
              <Server className="w-8 h-8" style={{ color: T.accent }} />
            </div>
            <h3 className="text-sm font-bold mb-2" style={{ color: T.textPrimary }}>
              Nenhum provedor cadastrado
            </h3>
            <p className="text-xs mb-4 text-center max-w-xs" style={{ color: T.textMuted }}>
              Cadastre seu primeiro provedor para começar a sincronizar dados e visualizar métricas.
            </p>
            <button
              onClick={() => { setEditProvider(null); setShowForm(true) }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all hover:opacity-90"
              style={{ background: T.accent, color: '#fff' }}>
              <Plus className="w-4 h-4" />
              Cadastrar Provedor
            </button>
          </div>
        ) : (
          /* Provider list */
          <div className="space-y-3 max-w-4xl mx-auto">

            {/* Sync Schedule Panel */}
            <SyncSchedulePanel />

            <p className="text-[10px] font-medium mb-2 mt-6" style={{ color: T.textMuted }}>
              Provedores
            </p>

            {providers.map(p => {
              const id = p._id || p.id
              const expanded = expandedId === id
              const erpDef = ERP_TYPES[p.erp]

              return (
                <div key={id} className="rounded-2xl transition-all"
                  style={{
                    background: T.card,
                    border: `1px solid ${expanded ? T.accent + '44' : T.cardBorder}`,
                  }}>

                  {/* Row */}
                  <div className="flex items-center justify-between px-5 py-4 cursor-pointer"
                    onClick={() => setExpandedId(expanded ? null : id)}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: `${erpDef?.color || T.accent}18` }}>
                        <span className="text-lg">{erpDef?.icon || '⚪'}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-bold" style={{ color: T.textPrimary }}>{p.name}</h3>
                          <ErpBadge erp={p.erp} />
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={p.lastSyncStatus} />
                          {p.lastSync && (
                            <span className="text-[10px]" style={{ color: T.textMuted }}>
                              Último sync: {new Date(p.lastSync).toLocaleString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Sync */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSync(p) }}
                        disabled={syncing[id]}
                        className="p-2 rounded-lg transition-all hover:opacity-80 disabled:opacity-40"
                        style={{ background: `${T.cyan}15`, color: T.cyan }}
                        title="Sincronizar dados">
                        <RefreshCw className={`w-4 h-4 ${syncing[id] ? 'animate-spin' : ''}`} />
                      </button>
                      {/* Edit */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(p) }}
                        className="p-2 rounded-lg transition-all hover:opacity-80"
                        style={{ background: `${T.accent}15`, color: T.accent }}
                        title="Editar provedor">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }}
                        className="p-2 rounded-lg transition-all hover:opacity-80"
                        style={{ background: `${T.red}15`, color: T.red }}
                        title="Excluir provedor">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {/* Expand */}
                      {expanded ?
                        <ChevronUp className="w-4 h-4" style={{ color: T.textMuted }} /> :
                        <ChevronDown className="w-4 h-4" style={{ color: T.textMuted }} />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expanded && (
                    <div className="px-5 pb-4 pt-1" style={{ borderTop: `1px solid ${T.cardBorder}` }}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                        <div className="rounded-xl p-3" style={{ background: T.bg }}>
                          <p className="text-[10px] font-medium mb-1" style={{ color: T.textMuted }}>Slug</p>
                          <p className="text-xs font-mono" style={{ color: T.textPrimary }}>{p.slug}</p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: T.bg }}>
                          <p className="text-[10px] font-medium mb-1" style={{ color: T.textMuted }}>Status</p>
                          <p className="text-xs" style={{ color: p.active ? T.green : T.red }}>
                            {p.active ? 'Ativo' : 'Inativo'}
                          </p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: T.bg }}>
                          <p className="text-[10px] font-medium mb-1" style={{ color: T.textMuted }}>Criado em</p>
                          <p className="text-xs" style={{ color: T.textPrimary }}>
                            {p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '—'}
                          </p>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: T.bg }}>
                          <p className="text-[10px] font-medium mb-1" style={{ color: T.textMuted }}>Sync Age</p>
                          <p className="text-xs" style={{ color: T.textPrimary }}>
                            {p.lastSync ? `${Math.round((Date.now() - new Date(p.lastSync)) / 60000)} min` : '—'}
                          </p>
                        </div>
                      </div>
                      {p.lastSyncError && (
                        <div className="mt-3 rounded-xl p-3 flex items-start gap-2"
                          style={{ background: `${T.red}08`, border: `1px solid ${T.red}22` }}>
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: T.red }} />
                          <div>
                            <p className="text-[10px] font-medium" style={{ color: T.red }}>Último erro de sync:</p>
                            <p className="text-[10px] mt-1 font-mono" style={{ color: T.textMuted }}>{p.lastSyncError}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Modals */}
      {showForm && (
        <ProviderFormModal
          provider={editProvider}
          onClose={() => { setShowForm(false); setEditProvider(null) }}
          onSaved={handleFormSaved}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          provider={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </div>
  )
}

export default Configuracoes

"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "./auth-context"
import { useGame } from "./game-context"
import { Shield, UserX, Eye, StopCircle, Crown } from "lucide-react"

interface AdminPanelProps {
  onClose: () => void
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const { user } = useAuth()
  const { state, sendActionToServer } = useGame()
  const [isLoading, setIsLoading] = React.useState(false)
  const [message, setMessage] = React.useState("")

  // Проверяем права админа
  if (!user?.isAdmin) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <Card className="w-full max-w-md bg-red-900/20 border border-red-800">
          <CardContent className="p-6 text-center">
            <p className="text-red-400">У вас нет прав администратора</p>
            <Button onClick={onClose} className="mt-4" variant="outline">
              Закрыть
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleKickPlayer = async (playerId: string, playerName: string) => {
    if (!confirm(`Вы уверены, что хотите исключить игрока ${playerName}?`)) return

    setIsLoading(true)
    try {
      await sendActionToServer("adminKick", { playerId })
      setMessage(`Игрок ${playerName} исключен`)
    } catch (error) {
      setMessage("Ошибка при исключении игрока")
    } finally {
      setIsLoading(false)
    }
  }

  const handleEndGame = async () => {
    if (!confirm("Вы уверены, что хотите принудительно завершить игру?")) return

    setIsLoading(true)
    try {
      await sendActionToServer("adminEndGame")
      setMessage("Игра принудительно завершена")
    } catch (error) {
      setMessage("Ошибка при завершении игры")
    } finally {
      setIsLoading(false)
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case "civilian":
        return "bg-blue-600/20 text-blue-300 border-blue-500/30"
      case "mafia":
        return "bg-red-600/20 text-red-300 border-red-500/30"
      case "sheriff":
        return "bg-yellow-600/20 text-yellow-300 border-yellow-500/30"
      case "doctor":
        return "bg-green-600/20 text-green-300 border-green-500/30"
      case "lover":
        return "bg-pink-600/20 text-pink-300 border-pink-500/30"
      case "don":
        return "bg-purple-600/20 text-purple-300 border-purple-500/30"
      default:
        return "bg-gray-600/20 text-gray-300 border-gray-500/30"
    }
  }

  const getRoleName = (role: string) => {
    switch (role) {
      case "civilian":
        return "Мирный житель"
      case "mafia":
        return "Мафия"
      case "sheriff":
        return "Шериф"
      case "doctor":
        return "Доктор"
      case "lover":
        return "Любовница"
      case "don":
        return "Дон мафии"
      default:
        return "Неизвестно"
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-black/90 border border-red-800">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Crown className="w-6 h-6 text-yellow-400" />
            <CardTitle className="text-2xl font-bold text-red-400">Панель администратора</CardTitle>
            <Crown className="w-6 h-6 text-yellow-400" />
          </div>
          <p className="text-gray-300">Добро пожаловать, {user.nickname}!</p>
          {message && (
            <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-800 rounded">
              <p className="text-yellow-400 text-sm">{message}</p>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Информация об игре */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Информация об игре
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900/30 p-3 rounded border border-gray-700">
                <p className="text-sm text-gray-400">Комната</p>
                <p className="text-white font-medium">{state.roomId || "Не в игре"}</p>
              </div>
              <div className="bg-gray-900/30 p-3 rounded border border-gray-700">
                <p className="text-sm text-gray-400">Фаза</p>
                <p className="text-white font-medium">{state.phase}</p>
              </div>
              <div className="bg-gray-900/30 p-3 rounded border border-gray-700">
                <p className="text-sm text-gray-400">День</p>
                <p className="text-white font-medium">{state.day}</p>
              </div>
              <div className="bg-gray-900/30 p-3 rounded border border-gray-700">
                <p className="text-sm text-gray-400">Таймер</p>
                <p className="text-white font-medium">{state.timer || "Нет"}</p>
              </div>
            </div>
          </div>

          <Separator className="bg-gray-700" />

          {/* Список игроков с ролями */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Игроки и их роли ({state.players.length})
            </h3>
            <div className="space-y-2">
              {state.players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-gray-900/30 rounded border border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{player.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{player.name}</span>
                        {player.isHost && (
                          <Badge variant="secondary" size="sm">
                            Хост
                          </Badge>
                        )}
                        {!player.isAlive && (
                          <Badge variant="destructive" size="sm">
                            Мертв
                          </Badge>
                        )}
                        {player.isSeduced && (
                          <Badge className="bg-pink-600/20 text-pink-300 border-pink-500/30" size="sm">
                            Соблазнен
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={getRoleColor(player.role)} size="sm">
                          {getRoleName(player.role)}
                        </Badge>
                        <span className="text-xs text-gray-400">ID: {player.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {player.clientId !== state.clientId && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleKickPlayer(player.id, player.name)}
                        disabled={isLoading}
                        className="flex items-center gap-1"
                      >
                        <UserX className="w-4 h-4" />
                        Кик
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator className="bg-gray-700" />

          {/* Действия администратора */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <StopCircle className="w-5 h-5" />
              Действия администратора
            </h3>
            <div className="flex gap-4">
              <Button
                variant="destructive"
                onClick={handleEndGame}
                disabled={isLoading || state.phase === "setup" || state.phase === "lobby"}
                className="flex items-center gap-2"
              >
                <StopCircle className="w-4 h-4" />
                Завершить игру
              </Button>
            </div>
          </div>

          <Separator className="bg-gray-700" />

          {/* Статистика голосования */}
          {Object.keys(state.votes).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Текущие голоса</h3>
              <div className="space-y-2">
                {Object.entries(state.votes).map(([voterId, targetId]) => {
                  const voter = state.players.find((p) => p.id === voterId)
                  const target = state.players.find((p) => p.id === targetId)
                  return (
                    <div key={voterId} className="flex justify-between p-2 bg-gray-900/20 rounded">
                      <span className="text-white">{voter?.name || "Неизвестно"}</span>
                      <span className="text-gray-300">→ {target?.name || "Неизвестно"}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Кнопка закрытия */}
          <div className="flex justify-center pt-4">
            <Button onClick={onClose} variant="outline" className="w-full max-w-xs">
              Закрыть панель
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

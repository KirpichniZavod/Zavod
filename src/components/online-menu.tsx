"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "./auth-context"

interface OnlineMenuProps {
  onBack: () => void
  onGameStart: () => void
}

export const OnlineMenu: React.FC<OnlineMenuProps> = ({ onBack, onGameStart }) => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = React.useState<"join" | "create">("join")
  const [roomName, setRoomName] = React.useState("")
  const [roomCode, setRoomCode] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [maxPlayers, setMaxPlayers] = React.useState(8)
  const [minPlayers, setMinPlayers] = React.useState(4)
  const [isPrivate, setIsPrivate] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [rooms, setRooms] = React.useState<any[]>([])
  const [error, setError] = React.useState("")

  // Refs для предотвращения race conditions
  const mountedRef = React.useRef(true)
  const abortControllerRef = React.useRef<AbortController>()

  React.useEffect(() => {
    return () => {
      mountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  React.useEffect(() => {
    if (activeTab === "join") {
      loadRooms()
    }
  }, [activeTab])

  // Функция для безопасного выполнения fetch запросов
  const safeFetch = async (url: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      })

      // Проверяем, что ответ действительно JSON
      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned non-JSON response. API may not be available.")
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return response
    } catch (error: any) {
      console.error("Fetch error:", error)
      throw new Error(error.message || "Network request failed")
    }
  }

  // Функция валидации данных комнаты
  const validateRoomData = (data: any) => {
    const errors: string[] = []

    if (data.roomName && (!data.roomName.trim() || data.roomName.length > 50)) {
      errors.push("Название комнаты должно быть от 1 до 50 символов")
    }

    if (data.playerName && (!data.playerName.trim() || data.playerName.length > 30)) {
      errors.push("Имя игрока должно быть от 1 до 30 символов")
    }

    if (data.roomId && (!data.roomId.trim() || data.roomId.length > 10)) {
      errors.push("Код комнаты должен быть от 1 до 10 символов")
    }

    if (data.password && data.password.length > 50) {
      errors.push("Пароль не должен превышать 50 символов")
    }

    return errors
  }

  const loadRooms = async () => {
    if (!mountedRef.current) return

    setIsLoading(true)
    setError("")

    // Отменяем предыдущий запрос
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()

    try {
      // Пытаемся загрузить комнаты из localStorage как fallback
      const localRooms = localStorage.getItem("mafia_rooms")
      if (localRooms) {
        const parsedRooms = JSON.parse(localRooms)
        setRooms(parsedRooms || [])
      }

      // Пытаемся загрузить с сервера
      const response = await safeFetch("/api/rooms", {
        signal: abortControllerRef.current.signal,
      })

      if (!mountedRef.current) return

      const data = await response.json()
      console.log("Loaded rooms:", data.rooms)

      const roomsList = data.rooms || []
      setRooms(roomsList)

      // Сохраняем в localStorage
      localStorage.setItem("mafia_rooms", JSON.stringify(roomsList))
    } catch (error: any) {
      if (!mountedRef.current) return

      if (error.name !== "AbortError") {
        console.error("Ошибка загрузки комнат:", error)

        // Используем fallback данные из localStorage
        const localRooms = localStorage.getItem("mafia_rooms")
        if (localRooms) {
          try {
            const parsedRooms = JSON.parse(localRooms)
            setRooms(parsedRooms || [])
            setError("Используются локальные данные. Сервер недоступен.")
          } catch {
            setRooms([])
            setError("Не удалось загрузить список комнат. Сервер недоступен.")
          }
        } else {
          setRooms([])
          setError("Не удалось загрузить список комнат. Сервер недоступен.")
        }
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }

  const handleCreateRoom = async () => {
    if (!user) {
      setError("Необходимо авторизоваться")
      return
    }

    const roomData = {
      roomName: roomName.trim(),
      playerName: user.nickname,
      minPlayers,
      maxPlayers,
      isPrivate,
      password: isPrivate ? password : undefined,
    }

    // Валидация данных
    const validationErrors = validateRoomData(roomData)
    if (validationErrors.length > 0) {
      setError(validationErrors[0])
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await safeFetch("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          ...roomData,
        }),
      })

      if (!mountedRef.current) return

      const data = await response.json()
      console.log("Create room response:", data)

      if (data.success) {
        const roomId = data.roomId || generateRoomId()
        const playerId = data.playerId || generatePlayerId()

        localStorage.setItem("mafia_player_id", playerId)
        localStorage.setItem("mafia_room_id", roomId)
        localStorage.setItem("mafia_is_host", String(data.isHost || true))
        localStorage.setItem("mafia_player_name", roomData.playerName)

        // Обновляем статистику игрока
        updatePlayerStats("gamesPlayed", 1)

        // Переходим к игре
        onGameStart()
      } else {
        setError(data.error || "Не удалось создать комнату")
      }
    } catch (error: any) {
      if (!mountedRef.current) return

      console.error("Ошибка создания комнаты:", error)

      // Fallback: создаем комнату локально
      const roomId = generateRoomId()
      const playerId = generatePlayerId()

      localStorage.setItem("mafia_player_id", playerId)
      localStorage.setItem("mafia_room_id", roomId)
      localStorage.setItem("mafia_is_host", "true")
      localStorage.setItem("mafia_player_name", roomData.playerName)

      // Сохраняем комнату локально
      const localRooms = JSON.parse(localStorage.getItem("mafia_rooms") || "[]")
      localRooms.push({
        id: roomId,
        name: roomData.roomName,
        players: 1,
        maxPlayers: roomData.maxPlayers,
        isPrivate: roomData.isPrivate,
        status: "waiting",
      })
      localStorage.setItem("mafia_rooms", JSON.stringify(localRooms))

      updatePlayerStats("gamesPlayed", 1)
      setError("Сервер недоступен. Создана локальная комната.")

      // Переходим к игре через небольшую задержку
      setTimeout(() => {
        onGameStart()
      }, 1000)
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }

  const handleJoinRoom = async (roomId?: string) => {
    if (!user) {
      setError("Необходимо авторизоваться")
      return
    }

    const targetRoomId = roomId || roomCode.trim()
    const joinData = {
      roomId: targetRoomId,
      playerName: user.nickname,
      password: password,
    }

    // Валидация данных
    const validationErrors = validateRoomData(joinData)
    if (validationErrors.length > 0) {
      setError(validationErrors[0])
      return
    }

    if (!targetRoomId) {
      setError("Введите код комнаты")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await safeFetch("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          action: "join",
          ...joinData,
        }),
      })

      if (!mountedRef.current) return

      const data = await response.json()
      console.log("Join room response:", data)

      if (data.success) {
        const playerId = data.playerId || generatePlayerId()

        localStorage.setItem("mafia_player_id", playerId)
        localStorage.setItem("mafia_room_id", data.roomId || targetRoomId)
        localStorage.setItem("mafia_is_host", String(data.isHost || false))
        localStorage.setItem("mafia_player_name", joinData.playerName)

        updatePlayerStats("gamesPlayed", 1)
        onGameStart()
      } else {
        setError(data.error || "Не удалось присоединиться к комнате")
      }
    } catch (error: any) {
      if (!mountedRef.current) return

      console.error("Ошибка присоединения к комнате:", error)

      // Fallback: присоединяемся локально
      const playerId = generatePlayerId()

      localStorage.setItem("mafia_player_id", playerId)
      localStorage.setItem("mafia_room_id", targetRoomId)
      localStorage.setItem("mafia_is_host", "false")
      localStorage.setItem("mafia_player_name", joinData.playerName)

      updatePlayerStats("gamesPlayed", 1)
      setError("Сервер недоступен. Присоединение к локальной комнате.")

      setTimeout(() => {
        onGameStart()
      }, 1000)
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }

  // Генерация уникальных ID
  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  const generatePlayerId = () => {
    return Math.random().toString(36).substring(2, 15)
  }

  // Функция для обновления статистики игрока
  const updatePlayerStats = (stat: string, value: number) => {
    try {
      // Получаем текущих пользователей
      const usersJson = localStorage.getItem("mafia_users")
      if (!usersJson || !user) return

      const users = JSON.parse(usersJson)
      const userIndex = users.findIndex((u: any) => u.id === user.id)

      if (userIndex !== -1) {
        // Обновляем статистику
        if (!users[userIndex].stats) {
          users[userIndex].stats = { gamesPlayed: 0, gamesWon: 0, winRate: 0 }
        }

        users[userIndex].stats[stat] += value

        // Пересчитываем процент побед
        if (users[userIndex].stats.gamesPlayed > 0) {
          users[userIndex].stats.winRate = (users[userIndex].stats.gamesWon / users[userIndex].stats.gamesPlayed) * 100
        }

        // Сохраняем обновленные данные
        localStorage.setItem("mafia_users", JSON.stringify(users))

        // Обновляем текущего пользователя
        const currentUserJson = localStorage.getItem("mafia_user")
        if (currentUserJson) {
          const currentUser = JSON.parse(currentUserJson)
          if (!currentUser.stats) {
            currentUser.stats = { gamesPlayed: 0, gamesWon: 0, winRate: 0 }
          }
          currentUser.stats[stat] += value

          if (currentUser.stats.gamesPlayed > 0) {
            currentUser.stats.winRate = (currentUser.stats.gamesWon / currentUser.stats.gamesPlayed) * 100
          }

          localStorage.setItem("mafia_user", JSON.stringify(currentUser))
        }
      }
    } catch (error) {
      console.error("Error updating player stats:", error)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-8">
      <Card className="w-full max-w-2xl p-6 space-y-6 bg-black/50 backdrop-blur-sm border border-purple-500/30">
        <div className="text-center mb-4">
          <h2 className="text-3xl font-bold mb-2 text-white">Онлайн игра</h2>
          <p className="text-gray-300">Создайте комнату или присоединитесь к существующей</p>
          {user && <p className="text-purple-400 mt-2">Вы играете как: {user.nickname}</p>}
        </div>

        {/* Показываем ошибки */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Табы */}
        <div className="flex space-x-1 bg-gray-900/50 p-1 rounded-lg">
          <Button
            className={`flex-1 ${activeTab === "join" ? "bg-purple-600 text-white" : "bg-transparent text-gray-400"}`}
            onClick={() => setActiveTab("join")}
          >
            Присоединиться
          </Button>
          <Button
            className={`flex-1 ${activeTab === "create" ? "bg-purple-600 text-white" : "bg-transparent text-gray-400"}`}
            onClick={() => setActiveTab("create")}
          >
            Создать комнату
          </Button>
        </div>

        {activeTab === "join" ? (
          <div className="space-y-4">
            {/* Поиск по коду */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Код комнаты</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Введите код комнаты"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="flex-1 bg-gray-900/50 text-white placeholder:text-gray-400 border-purple-500/30"
                  maxLength={10}
                />
                <Button
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => handleJoinRoom()}
                  disabled={!roomCode.trim() || isLoading}
                >
                  {isLoading ? "Загрузка..." : "Войти"}
                </Button>
              </div>
            </div>

            {/* Пароль для приватных комнат */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Пароль (если комната приватная)</label>
              <Input
                type="password"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-900/50 text-white placeholder:text-gray-400 border-purple-500/30"
                maxLength={50}
              />
            </div>

            {/* Список комнат */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-white">Доступные комнаты</label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={loadRooms}
                  disabled={isLoading}
                  className="text-purple-400 hover:text-purple-300"
                >
                  Обновить
                </Button>
              </div>
              {isLoading ? (
                <div className="flex justify-center py-8 text-purple-400">Загрузка...</div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {rooms.length === 0 ? (
                    <div className="text-center py-8 text-gray-300">
                      <p>Нет доступных комнат</p>
                    </div>
                  ) : (
                    rooms.map((room) => (
                      <div
                        key={room.id}
                        className="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg border border-purple-500/20"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{room.name}</span>
                            <Badge className="bg-purple-600/20 text-purple-300 border-purple-500/30">{room.id}</Badge>
                            {room.isPrivate && (
                              <Badge variant="secondary" className="bg-pink-600/20 text-pink-300 border-pink-500/30">
                                Приватная
                              </Badge>
                            )}
                            <Badge variant="outline" className="border-purple-500/30 text-purple-300">
                              {room.status === "waiting" ? "Ожидание" : "В игре"}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-300">
                            Игроков: {room.players}/{room.maxPlayers}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                          onClick={() => handleJoinRoom(room.id)}
                          disabled={room.status !== "waiting" || room.players >= room.maxPlayers || isLoading}
                        >
                          Войти
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-white">Название комнаты</label>
              <Input
                placeholder="Введите название комнаты"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="bg-gray-900/50 text-white placeholder:text-gray-400 border-purple-500/30"
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-white">Минимум игроков: {minPlayers}</label>
              <Slider
                min={4}
                max={8}
                step={1}
                defaultValue={[minPlayers]}
                onValueChange={(value) => {
                  const newMin = value[0]
                  setMinPlayers(newMin)
                  if (maxPlayers < newMin) {
                    setMaxPlayers(newMin)
                  }
                }}
                className="[&_[role=slider]]:bg-purple-600 [&_[role=slider]]:border-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-300 mt-1">
                <span>4</span>
                <span>8</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-white">Максимум игроков: {maxPlayers}</label>
              <Slider
                min={minPlayers}
                max={10}
                step={1}
                defaultValue={[maxPlayers]}
                onValueChange={(value) => setMaxPlayers(value[0])}
                className="[&_[role=slider]]:bg-purple-600 [&_[role=slider]]:border-purple-500"
              />
              <div className="flex justify-between text-xs text-gray-300 mt-1">
                <span>{minPlayers}</span>
                <span>10</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="isPrivate"
                checked={isPrivate}
                onCheckedChange={(e) => setIsPrivate(!!e)}
                className="border-purple-500/50 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
              />
              <label htmlFor="isPrivate" className="text-sm font-medium text-white">
                Приватная комната
              </label>
            </div>

            {isPrivate && (
              <div>
                <label className="block text-sm font-medium mb-1 text-white">Пароль</label>
                <Input
                  type="password"
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-gray-900/50 text-white placeholder:text-gray-400 border-purple-500/30"
                  maxLength={50}
                />
              </div>
            )}

            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleCreateRoom}
              disabled={!roomName.trim() || isLoading}
            >
              {isLoading ? "Создание комнаты..." : "Создать комнату"}
            </Button>
          </div>
        )}

        <div className="pt-4 border-t border-purple-500/30">
          <Button
            variant="ghost"
            onClick={onBack}
            className="w-full text-gray-300 hover:text-white hover:bg-purple-600/20"
          >
            Назад
          </Button>
        </div>
      </Card>
    </div>
  )
}

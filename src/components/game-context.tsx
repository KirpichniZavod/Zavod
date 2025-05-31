"use client"

import React from "react"
import { safeLocalStorage, generateId } from "../utils/safe-storage"

// Типы ролей
export type Role = "civilian" | "mafia" | "sheriff" | "doctor" | "lover" | "don"

// Типы фаз игры
export type GamePhase =
  | "setup"
  | "lobby"
  | "day"
  | "voting"
  | "last-word"
  | "night"
  | "mafia-turn"
  | "mafia-chat"
  | "sheriff-turn"
  | "doctor-turn"
  | "lover-turn"
  | "results"
  | "game-over"

// Интерфейс игрока
export interface Player {
  id: string
  name: string
  role: Role
  isAlive: boolean
  avatar: string
  isHost?: boolean
  isConnected?: boolean
  clientId?: string
  isSeduced: boolean
  canVote: boolean
  canUseAbility: boolean
}

// Интерфейс сообщения
export interface Message {
  id: string
  playerId: string
  text: string
  timestamp: number
  isSystem?: boolean
}

// Интерфейс состояния игры
interface GameState {
  players: Player[]
  messages: Message[]
  mafiaMessages: Message[]
  phase: GamePhase
  day: number
  selectedPlayer: string | null
  checkedPlayers: Record<string, Role>
  votes: Record<string, string>
  mafiaVotes: Record<string, string>
  winner: "mafia" | "civilians" | null
  timer: number | null
  mafiaCount: number
  eliminatedPlayer: Player | null
  killedPlayer: Player | null
  // Онлайн
  isOnline: boolean
  roomId: string | null
  isHost: boolean
  clientId: string
  // Роли
  doctorTarget: string | null
  loverPair: [string, string] | null
  protectedPlayer: string | null
  sheriffChecked: string | null
  seducedPlayer: string | null
  loverTarget: string | null
}

// Интерфейс контекста игры
interface GameContextType {
  state: GameState
  setState: React.Dispatch<React.SetStateAction<GameState>>
  selectPlayer: (playerId: string) => void
  sendMessage: (text: string, isMafiaChat?: boolean) => void
  vote: (targetId: string, isMafiaVote?: boolean) => void
  nextPhase: () => void
  leaveRoom: () => void
  // Онлайн
  createRoom: (roomName: string, maxPlayers: number, isPrivate: boolean, password?: string) => Promise<string>
  joinRoom: (roomId: string, password?: string) => Promise<boolean>
  getRooms: () => Promise<any[]>
  // Роли
  doctorProtect: (playerId: string) => void
  sheriffCheck: (playerId: string) => void
  setLoverPair: (player1Id: string, player2Id: string) => void
  loverSeduce: (playerId: string) => void
  donCheck: (playerId: string) => void
  // Синхронизация с сервером
  syncGameState: () => Promise<void>
  sendActionToServer: (action: string, data?: any) => Promise<void>
}

// Создание контекста
const GameContext = React.createContext<GameContextType | undefined>(undefined)

// Провайдер контекста
export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<GameState>({
    players: [],
    messages: [],
    mafiaMessages: [],
    phase: "setup",
    day: 1,
    selectedPlayer: null,
    checkedPlayers: {},
    votes: {},
    mafiaVotes: {},
    winner: null,
    timer: null,
    mafiaCount: 0,
    eliminatedPlayer: null,
    killedPlayer: null,
    isOnline: false,
    roomId: null,
    isHost: false,
    clientId: generateId(),
    doctorTarget: null,
    loverPair: null,
    protectedPlayer: null,
    sheriffChecked: null,
    seducedPlayer: null,
    loverTarget: null,
  })

  // Функция для отправки действий на сервер
  const sendActionToServer = React.useCallback(
    async (action: string, data?: any) => {
      if (!state.isOnline || !state.roomId || !state.clientId) return

      try {
        await fetch("/api/game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: state.roomId,
            playerId: state.clientId,
            action,
            data,
          }),
        })
      } catch (error) {
        console.error("Error sending action to server:", error)
      }
    },
    [state.isOnline, state.roomId, state.clientId],
  )

  // Функция для синхронизации с сервером
  const syncGameState = React.useCallback(async () => {
    if (!state.isOnline || !state.roomId || !state.clientId) return

    try {
      const response = await fetch(`/api/game?roomId=${state.roomId}&playerId=${state.clientId}`)
      const data = await response.json()

      if (data.success && data.room && data.room.gameState) {
        setState((prevState) => ({
          ...prevState,
          ...data.room.gameState,
          isOnline: true,
          roomId: state.roomId,
          clientId: state.clientId,
        }))
      }
    } catch (error) {
      console.error("Error syncing game state:", error)
    }
  }, [state.isOnline, state.roomId, state.clientId])

  // Автоматическая синхронизация каждую секунду в онлайн режиме
  React.useEffect(() => {
    if (!state.isOnline) return

    const interval = setInterval(() => {
      syncGameState()
    }, 1000)

    return () => clearInterval(interval)
  }, [state.isOnline, syncGameState])

  // Все действия игрока отправляются на сервер
  const selectPlayer = React.useCallback(
    (playerId: string) => {
      sendActionToServer("selectPlayer", { playerId })
    },
    [sendActionToServer],
  )

  const sendMessage = React.useCallback(
    (text: string, isMafiaChat = false) => {
      sendActionToServer("sendMessage", { text, isMafiaChat })
    },
    [sendActionToServer],
  )

  const vote = React.useCallback(
    (targetId: string, isMafiaVote = false) => {
      sendActionToServer("vote", { targetId, isMafiaVote })
    },
    [sendActionToServer],
  )

  const nextPhase = React.useCallback(() => {
    sendActionToServer("nextPhase")
  }, [sendActionToServer])

  const doctorProtect = React.useCallback(
    (playerId: string) => {
      sendActionToServer("doctorProtect", { playerId })
    },
    [sendActionToServer],
  )

  const sheriffCheck = React.useCallback(
    (playerId: string) => {
      sendActionToServer("sheriffCheck", { playerId })
    },
    [sendActionToServer],
  )

  const loverSeduce = React.useCallback(
    (playerId: string) => {
      sendActionToServer("loverSeduce", { playerId })
    },
    [sendActionToServer],
  )

  const donCheck = React.useCallback(
    (playerId: string) => {
      sendActionToServer("donCheck", { playerId })
    },
    [sendActionToServer],
  )

  const setLoverPair = React.useCallback(
    (player1Id: string, player2Id: string) => {
      sendActionToServer("setLoverPair", { player1Id, player2Id })
    },
    [sendActionToServer],
  )

  const leaveRoom = React.useCallback(() => {
    // Удаляем данные из localStorage при выходе
    safeLocalStorage.removeItem("mafia_player_id")
    safeLocalStorage.removeItem("mafia_room_id")
    safeLocalStorage.removeItem("mafia_is_host")
    safeLocalStorage.removeItem("mafia_player_name")

    setState((prev) => ({
      ...prev,
      players: [],
      messages: [],
      mafiaMessages: [],
      phase: "setup",
      day: 1,
      selectedPlayer: null,
      checkedPlayers: {},
      votes: {},
      mafiaVotes: {},
      winner: null,
      timer: null,
      mafiaCount: 0,
      eliminatedPlayer: null,
      killedPlayer: null,
      isOnline: false,
      roomId: null,
      isHost: false,
      doctorTarget: null,
      loverPair: null,
      protectedPlayer: null,
      sheriffChecked: null,
      seducedPlayer: null,
      loverTarget: null,
    }))
  }, [])

  // Онлайн функции
  const createRoom = React.useCallback(
    async (roomName: string, maxPlayers: number, isPrivate: boolean, password?: string): Promise<string> => {
      const roomId = safeLocalStorage.getItem("mafia_room_id")
      const playerId = safeLocalStorage.getItem("mafia_player_id")
      const isHost = safeLocalStorage.getItem("mafia_is_host") === "true"

      if (roomId && playerId) {
        setState((prev) => ({
          ...prev,
          isOnline: true,
          roomId,
          isHost,
          clientId: playerId,
          phase: "lobby",
        }))
        return roomId
      }
      return roomId || ""
    },
    [],
  )

  const joinRoom = React.useCallback(async (roomId: string, password?: string): Promise<boolean> => {
    const savedRoomId = safeLocalStorage.getItem("mafia_room_id")
    const playerId = safeLocalStorage.getItem("mafia_player_id")
    const isHost = safeLocalStorage.getItem("mafia_is_host") === "true"

    if (savedRoomId && playerId) {
      setState((prev) => ({
        ...prev,
        isOnline: true,
        roomId: savedRoomId,
        isHost,
        clientId: playerId,
        phase: "lobby",
      }))
      return true
    }
    return false
  }, [])

  const getRooms = React.useCallback(async (): Promise<any[]> => {
    try {
      const response = await fetch("/api/rooms")
      const data = await response.json()
      return data.rooms || []
    } catch (error) {
      console.error("Ошибка получения списка комнат:", error)
      return []
    }
  }, [])

  const value = React.useMemo(
    () => ({
      state,
      setState,
      selectPlayer,
      sendMessage,
      vote,
      nextPhase,
      leaveRoom,
      createRoom,
      joinRoom,
      getRooms,
      doctorProtect,
      sheriffCheck,
      setLoverPair,
      loverSeduce,
      donCheck,
      syncGameState,
      sendActionToServer,
    }),
    [
      state,
      setState,
      selectPlayer,
      sendMessage,
      vote,
      nextPhase,
      leaveRoom,
      createRoom,
      joinRoom,
      getRooms,
      doctorProtect,
      sheriffCheck,
      setLoverPair,
      loverSeduce,
      donCheck,
      syncGameState,
      sendActionToServer,
    ],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export const useGame = () => {
  const context = React.useContext(GameContext)
  if (context === undefined) {
    throw new Error("useGame must be used within a GameProvider")
  }
  return context
}

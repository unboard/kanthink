'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { STORAGE_KEY } from '@/lib/constants'

interface MigrationResult {
  channels: number
  cards: number
  tasks: number
  instructionCards: number
  folders: number
}

interface MigrationModalProps {
  onClose: () => void
  onMigrationComplete: () => void
}

export function MigrationModal({ onClose, onMigrationComplete }: MigrationModalProps) {
  const [status, setStatus] = useState<'pending' | 'migrating' | 'success' | 'error'>('pending')
  const [result, setResult] = useState<MigrationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleMigrate = async () => {
    setStatus('migrating')
    setError(null)

    try {
      // Get data from localStorage
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        setError('No local data found to migrate')
        setStatus('error')
        return
      }

      const data = JSON.parse(stored)
      if (!data.state) {
        setError('Invalid localStorage format')
        setStatus('error')
        return
      }

      // Send to migration API
      const response = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.state),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Migration failed')
      }

      const responseData = await response.json()
      setResult(responseData.migrated)
      setStatus('success')

      // Clear localStorage after successful migration
      localStorage.removeItem(STORAGE_KEY)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during migration')
      setStatus('error')
    }
  }

  const handleComplete = () => {
    onMigrationComplete()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        {status === 'pending' && (
          <>
            <h2 className="text-xl font-semibold mb-4">Migrate Your Data</h2>
            <p className="text-gray-600 mb-4">
              We found existing data stored locally on this device. Would you like to
              migrate it to the cloud so you can access it from any device?
            </p>
            <p className="text-sm text-gray-500 mb-6">
              This will upload your channels, cards, tasks, and settings to your account.
              Your local data will be cleared after a successful migration.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Skip for now
              </button>
              <button
                onClick={handleMigrate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Migrate Data
              </button>
            </div>
          </>
        )}

        {status === 'migrating' && (
          <>
            <h2 className="text-xl font-semibold mb-4">Migrating...</h2>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
            <p className="text-center text-gray-600">
              Please wait while we transfer your data to the cloud.
            </p>
          </>
        )}

        {status === 'success' && result && (
          <>
            <h2 className="text-xl font-semibold mb-4 text-green-600">
              Migration Complete!
            </h2>
            <p className="text-gray-600 mb-4">
              Your data has been successfully migrated:
            </p>
            <ul className="space-y-2 mb-6 text-gray-700">
              <li className="flex justify-between">
                <span>Channels</span>
                <span className="font-medium">{result.channels}</span>
              </li>
              <li className="flex justify-between">
                <span>Cards</span>
                <span className="font-medium">{result.cards}</span>
              </li>
              <li className="flex justify-between">
                <span>Tasks</span>
                <span className="font-medium">{result.tasks}</span>
              </li>
              <li className="flex justify-between">
                <span>Instructions</span>
                <span className="font-medium">{result.instructionCards}</span>
              </li>
              <li className="flex justify-between">
                <span>Folders</span>
                <span className="font-medium">{result.folders}</span>
              </li>
            </ul>
            <button
              onClick={handleComplete}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Continue
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Migration Failed
            </h2>
            <p className="text-gray-600 mb-4">
              {error || 'An error occurred during migration.'}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Your local data has not been modified. You can try again or continue
              using local storage.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleMigrate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Hook to detect if localStorage has data that should be migrated.
 * Returns true if there's local data and the user is authenticated.
 */
export function useMigrationDetection(): boolean {
  const [shouldMigrate, setShouldMigrate] = useState(false)
  const hasHydrated = useStore((state) => state._hasHydrated)
  const channelCount = useStore((state) => Object.keys(state.channels).length)

  useEffect(() => {
    // Only check after store has hydrated
    if (!hasHydrated) return

    // Check if we have local data
    const hasLocalData = channelCount > 0
    setShouldMigrate(hasLocalData)
  }, [hasHydrated, channelCount])

  return shouldMigrate
}

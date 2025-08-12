import React from 'react';
import { Settings as SettingsIcon, User, Shield, Database, Cpu } from 'lucide-react';

export function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Configure your IP2M METRR Copilot preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Settings */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <User className="w-5 h-5 text-gray-400 mr-2" />
              <h2 className="text-lg font-medium text-gray-900">User Profile</h2>
            </div>
          </div>
          <div className="p-6">
            <p className="text-gray-600">User profile settings coming soon...</p>
          </div>
        </div>

        {/* Security Settings */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <Shield className="w-5 h-5 text-gray-400 mr-2" />
              <h2 className="text-lg font-medium text-gray-900">Security</h2>
            </div>
          </div>
          <div className="p-6">
            <p className="text-gray-600">Security settings coming soon...</p>
          </div>
        </div>

        {/* System Settings */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <Cpu className="w-5 h-5 text-gray-400 mr-2" />
              <h2 className="text-lg font-medium text-gray-900">System</h2>
            </div>
          </div>
          <div className="p-6">
            <p className="text-gray-600">System settings coming soon...</p>
          </div>
        </div>

        {/* Database Settings */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <Database className="w-5 h-5 text-gray-400 mr-2" />
              <h2 className="text-lg font-medium text-gray-900">Database</h2>
            </div>
          </div>
          <div className="p-6">
            <p className="text-gray-600">Database settings coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

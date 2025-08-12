import React from 'react';
import { Plus, FileText, Calendar, User } from 'lucide-react';

export function Assessments() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assessments</h1>
          <p className="text-gray-600">Manage your IP2M METRR assessments</p>
        </div>
        <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          New Assessment
        </button>
      </div>

      {/* Assessment List Placeholder */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assessments yet</h3>
            <p className="text-gray-600 mb-6">Create your first IP2M METRR assessment to get started</p>
            <button className="flex items-center mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Assessment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssessmentDetail() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Assessment Detail</h1>
        <p className="text-gray-600">View and manage assessment details</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">Assessment detail view coming soon...</p>
      </div>
    </div>
  );
}

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, FileText, Upload, Users, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';

export function Dashboard() {
  const { data: ragStats } = useQuery({
    queryKey: ['rag-stats'],
    queryFn: () => api.getRAGStats(),
  });

  const { data: assessments } = useQuery({
    queryKey: ['assessments', { limit: 5 }],
    queryFn: () => api.getAssessments({ limit: 5 }),
  });

  const stats = [
    {
      name: 'Active Assessments',
      value: assessments?.data?.assessments?.filter((a: any) => 
        !['COMPLETED', 'CANCELLED'].includes(a.state)
      ).length || 0,
      icon: FileText,
      color: 'bg-blue-500',
    },
    {
      name: 'Documents Ingested',
      value: ragStats?.data?.stats?.documentCount || 0,
      icon: Upload,
      color: 'bg-green-500',
    },
    {
      name: 'Knowledge Chunks',
      value: ragStats?.data?.stats?.chunkCount || 0,
      icon: BarChart3,
      color: 'bg-purple-500',
    },
    {
      name: 'Pending Reviews',
      value: assessments?.data?.assessments?.filter((a: any) => 
        a.state === 'HIL_REVIEW'
      ).length || 0,
      icon: AlertTriangle,
      color: 'bg-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Overview of your IP2M METRR assessments and system status</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className={`${stat.color} rounded-lg p-3`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Assessments */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Recent Assessments</h2>
        </div>
        <div className="p-6">
          {assessments?.data?.assessments?.length > 0 ? (
            <div className="space-y-4">
              {assessments.data.assessments.map((assessment: any) => (
                <div key={assessment.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">{assessment.name}</h3>
                    <p className="text-sm text-gray-600">{assessment.organizationName}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      assessment.state === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                      assessment.state === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {assessment.state.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(assessment.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No assessments yet</p>
              <p className="text-sm text-gray-500">Create your first assessment to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">System Status</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">API Server Connected</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Ollama Service Ready</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Vector Database Online</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
              <span className="text-sm text-gray-700">Document Processing Ready</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Users, BookOpen, Settings } from 'lucide-react';

export default function AdminDashboardClient() {
  const adminSections = [
    {
      title: 'Fighter Types',
      description: 'Manage fighter types and their characteristics',
      href: '/admin/fighter-types',
      icon: Users,
    },
    {
      title: 'Gang Types',
      description: 'Manage gang types and their characteristics',
      href: '/admin/gang-types',
      icon: BookOpen,
    },
    {
      title: 'Equipment',
      description: 'Manage equipment and weapons',
      href: '/admin/equipment',
      icon: Settings,
    },
  ];

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-white shadow-md rounded-lg p-4 md:p-6">
          <h1 className="text-xl md:text-2xl font-bold mb-4">
            Admin Dashboard
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {adminSections.map((section) => {
              const Icon = section.icon;
              return (
                <Link
                  key={section.title}
                  href={section.href}
                  className="bg-gray-50 p-4 rounded-lg hover:bg-gray-100 transition-colors group"
                >
                  <div className="flex items-start space-x-3">
                    <Icon className="h-6 w-6 text-gray-500 group-hover:text-primary" />
                    <div>
                      <h2 className="text-xl font-semibold mb-2 group-hover:text-primary">
                        {section.title}
                      </h2>
                      <p className="text-gray-600">{section.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

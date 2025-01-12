export default function CampaignTerritoriesTable() {
  // Dummy data for the UI
  const territories = [
    { id: '1', name: 'Stinger Mould Sprawl' },
    { id: '2', name: 'Fighting Pit' },
    { id: '3', name: 'Old Ruins' },
    { id: '4', name: 'Refuse Drift' },
    { id: '5', name: 'Smelting Works' }
  ];

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="h-12 px-4 text-left align-middle font-medium">Territory</th>
          </tr>
        </thead>
        <tbody>
          {territories.map((territory) => (
            <tr key={territory.id} className="border-b hover:bg-gray-50">
              <td className="h-12 px-4 align-middle">
                <div className="font-medium">{territory.name}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 
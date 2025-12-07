import AboutMundaManager from "@/components/munda-manager-info/about-munda-manager";

export default function AboutPage() {
  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container ml-[10px] mr-[10px] max-w-4xl w-full space-y-4">
        <div className="bg-card shadow-md rounded-lg p-4">
          <h1 className="text-xl md:text-2xl font-bold mb-4">About Munda Manager</h1>
          <AboutMundaManager />
        </div>
      </div>
    </main>
  );
}

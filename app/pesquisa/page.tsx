import Header from "../components/Header";
import { useRouter } from "next/navigation";

export default function Pesquisa() {
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-grow p-4">
                <h1 className="text-2xl font-bold mb-4">Resultados para "termo de pesquisa"</h1>
                
            </main>
        </div>
    );
}
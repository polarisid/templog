
'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { format, subDays, startOfDay, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Sector {
  id: string;
  name: string;
  temp_min: number;
  temp_max: number;
  humidity_min: number;
  humidity_max: number;
}

interface Record {
  id: string;
  temperature: number;
  humidity: number;
  timestamp: Timestamp;
  turno: string;
}

type Period = 'week' | 'month';

export default function HistoryPage() {
  const { user } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [records, setRecords] = useState<Record[]>([]);
  const [loadingSectors, setLoadingSectors] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoadingSectors(true);
    const q = query(collection(db, 'sectors'), where('admin_uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sectorsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sector));
      setSectors(sectorsData);
      if (sectorsData.length > 0 && !selectedSector) {
        setSelectedSector(sectorsData[0]);
      }
      setLoadingSectors(false);
    });
    return () => unsubscribe();
  }, [user, selectedSector]);

  useEffect(() => {
    if (!selectedSector || !user) return;

    setLoadingRecords(true);
    const days = period === 'week' ? 7 : 30;
    const startDate = startOfDay(subDays(new Date(), days - 1));

    const q = query(
      collection(db, 'records'),
      where('sector_id', '==', selectedSector.id),
      where('timestamp', '>=', startDate),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Record));
      setRecords(recordsData);
      setLoadingRecords(false);
    }, (error) => {
      console.error("Error fetching records: ", error);
      setLoadingRecords(false);
    });

    return () => unsubscribe();
  }, [selectedSector, period, user]);

  const chartData = useMemo(() => {
    if (records.length === 0) return [];

    const groupedByDay: { [key: string]: { temps: number[], humids: number[] } } = {};

    records.forEach(record => {
      const day = format(record.timestamp.toDate(), 'yyyy-MM-dd');
      if (!groupedByDay[day]) {
        groupedByDay[day] = { temps: [], humids: [] };
      }
      groupedByDay[day].temps.push(record.temperature);
      groupedByDay[day].humids.push(record.humidity);
    });

    return Object.entries(groupedByDay).map(([day, values]) => {
      const avgTemp = values.temps.reduce((a, b) => a + b, 0) / values.temps.length;
      const avgHumidity = values.humids.reduce((a, b) => a + b, 0) / values.humids.length;
      return {
        date: format(new Date(day), 'dd/MM'),
        Temperatura: parseFloat(avgTemp.toFixed(1)),
        Umidade: parseFloat(avgHumidity.toFixed(1)),
      };
    }).sort((a,b) => a.date.localeCompare(b.date));
    
  }, [records]);

  const chartConfig = {
    Temperatura: {
      label: 'Temperatura Média (°C)',
      color: 'hsl(var(--chart-1))',
    },
    Umidade: {
      label: 'Umidade Média (%)',
      color: 'hsl(var(--chart-2))',
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Histórico de Medições</h2>
          <p className="text-muted-foreground">Analise os dados de temperatura e umidade ao longo do tempo.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros de Visualização</CardTitle>
          <CardDescription>Selecione um setor e o período para visualizar o histórico.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          {loadingSectors ? (
            <Skeleton className="h-10 w-full sm:w-64" />
          ) : (
            <Select
              onValueChange={(sectorId) => setSelectedSector(sectors.find(s => s.id === sectorId) || null)}
              value={selectedSector?.id}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Selecione um setor" />
              </SelectTrigger>
              <SelectContent>
                {sectors.map(sector => (
                  <SelectItem key={sector.id} value={sector.id}>{sector.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-2">
            <Button variant={period === 'week' ? 'default' : 'outline'} onClick={() => setPeriod('week')}>Semanal</Button>
            <Button variant={period === 'month' ? 'default' : 'outline'} onClick={() => setPeriod('month')}>Mensal</Button>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle>Gráfico de Histórico</CardTitle>
            {selectedSector && (
                <CardDescription>
                    Visualizando dados para {selectedSector.name} - Últimos {period === 'week' ? '7 dias' : '30 dias'}.
                </CardDescription>
            )}
        </CardHeader>
        <CardContent>
            {loadingRecords ? (
                <Skeleton className="h-[60vh] w-full" />
            ) : records.length > 0 && selectedSector ? (
                <div className="w-full h-[60vh] min-h-[400px]">
                <ChartContainer config={chartConfig} className="w-full h-full">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                        />
                         <YAxis yAxisId="left" stroke={chartConfig.Temperatura.color} domain={['dataMin - 2', 'dataMax + 2']} />
                         <YAxis yAxisId="right" orientation="right" stroke={chartConfig.Umidade.color} domain={['dataMin - 5', 'dataMax + 5']} />
                        <ChartTooltip 
                            cursor={{ strokeDasharray: '3 3' }}
                            content={<ChartTooltipContent 
                                formatter={(value, name) => {
                                    const unit = name === 'Temperatura' ? '°C' : '%';
                                    return `${value} ${unit}`;
                                }}
                            />} 
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <ReferenceLine y={selectedSector.temp_max} yAxisId="left" label={{ value: `Temp Max: ${selectedSector.temp_max}°`, position: 'insideTopRight', fill: '#ef4444' }} stroke="#ef4444" strokeDasharray="3 3" />
                        <ReferenceLine y={selectedSector.temp_min} yAxisId="left" label={{ value: `Temp Min: ${selectedSector.temp_min}°`, position: 'insideBottomRight', fill: '#ef4444' }} stroke="#ef4444" strokeDasharray="3 3" />
                        <ReferenceLine y={selectedSector.humidity_max} yAxisId="right" label={{ value: `Umid Max: ${selectedSector.humidity_max}%`, position: 'insideTopLeft', fill: '#22c55e' }} stroke="#22c55e" strokeDasharray="3 3" />
                        <ReferenceLine y={selectedSector.humidity_min} yAxisId="right" label={{ value: `Umid Min: ${selectedSector.humidity_min}%`, position: 'insideBottomLeft', fill: '#22c55e' }} stroke="#22c55e" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="Temperatura" stroke="var(--color-Temperatura)" yAxisId="left" />
                        <Line type="monotone" dataKey="Umidade" stroke="var(--color-Umidade)" yAxisId="right" />
                    </LineChart>
                </ChartContainer>
                </div>
            ) : (
                <div className="flex h-96 w-full items-center justify-center text-muted-foreground">
                    {selectedSector ? 'Nenhum registro encontrado para este período.' : 'Por favor, selecione um setor.'}
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

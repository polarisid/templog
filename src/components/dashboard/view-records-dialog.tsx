'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { type Sector } from '@/app/(main)/dashboard/page';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, FileDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';

interface Record {
  id: string;
  temperature: number;
  humidity: number;
  timestamp: Timestamp;
  turno: string;
  observation: string;
  is_temp_ok: boolean;
  is_humidity_ok: boolean;
}

interface ViewRecordsDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  sector: Sector;
}

export function ViewRecordsDialog({ isOpen, setIsOpen, sector }: ViewRecordsDialogProps) {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<Date | undefined>(new Date());

  useEffect(() => {
    if (!isOpen || !date) {
        setRecords([]);
        setLoading(!date);
        return;
    }
    setLoading(true);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'records'),
      where('sector_id', '==', sector.id),
      where('timestamp', '>=', startOfDay),
      where('timestamp', '<=', endOfDay),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const recordsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Record));
      setRecords(recordsData);
      setLoading(false);
    }, (error) => {
        console.error("Error fetching records: ", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [sector.id, date, isOpen]);

  const exportToCsv = () => {
    const headers = ['Horário', 'Turno', 'Temperatura (°C)', 'Temp OK', 'Umidade (%)', 'Umidade OK', 'Observações'];
    const rows = records.sort((a,b) => a.timestamp.toDate().getTime() - b.timestamp.toDate().getTime()).map(r => [
      format(r.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss'),
      r.turno,
      r.temperature,
      r.is_temp_ok,
      r.humidity,
      r.is_humidity_ok,
      `"${r.observation.replace(/"/g, '""')}"`
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `registros_${sector.name}_${format(date || new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Registros para {sector.name}</DialogTitle>
          <DialogDescription>
            Visualizando registros para {format(date || new Date(), 'PPP', { locale: ptBR })}. Temp Ideal: {sector.temp_min}°C - {sector.temp_max}°C, Umidade: {sector.humidity_min}% - {sector.humidity_max}%.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full sm:w-[240px] justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
          <Button onClick={exportToCsv} disabled={records.length === 0} className="w-full sm:w-auto">
            <FileDown className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-auto">
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Horário</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Temperatura</TableHead>
                    <TableHead>Umidade</TableHead>
                    <TableHead>Observações</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                    </TableRow>
                    ))
                ) : records.length > 0 ? (
                    records.map(record => (
                    <TableRow key={record.id}>
                        <TableCell>{format(record.timestamp.toDate(), 'HH:mm')}</TableCell>
                        <TableCell>{record.turno}</TableCell>
                        <TableCell>
                        <Badge variant={record.is_temp_ok ? 'secondary' : 'destructive'}>
                            {record.temperature}°C
                        </Badge>
                        </TableCell>
                        <TableCell>
                        <Badge variant={record.is_humidity_ok ? 'secondary' : 'destructive'}>
                            {record.humidity}%
                        </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{record.observation || '-'}</TableCell>
                    </TableRow>
                    ))
                ) : (
                    <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                        Nenhum registro encontrado para esta data.
                    </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
